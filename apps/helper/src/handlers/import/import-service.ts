// 履歷匯入服務（F02、R10、D18；D28 加網頁擷取與手動輸入）：建立工作階段 → 暫存校正 → 使用者確認後寫入 Profile。
// PDF 只從注入的系統選取器進來（helper 自己開，請求不帶路徑；R7、ADR-0003），完整路徑不經過本服務；
// 沒有選取器時不提供 pickPdf（回尚未支援），網頁擷取與手動輸入照常可用。
// 工作階段只留在記憶體（Q11）：三種來源共用最多 maxImports 筆、超過丟最舊；擷取送達不呼叫模型。
// 有接上 AI（deps.ai）時另提供 AI 整理（P1-T069，ai-runner.ts）；沒接上時這兩個方法不存在（回尚未支援）。
import type {
  ImportLatestCapture,
  ImportResult,
  Profile,
  ProfileInput,
} from '@rolecraft/contracts';
import { extractResumePdf, type ExtractResult } from '@rolecraft/resume-import';
import { newId as defaultNewId } from '@rolecraft/storage';

import { uniqueProfile } from '../profile/unique.ts';
import { createAiParser, type AiSource, type ImportAiDeps } from './ai-runner.ts';
import type { AiJob } from './ai-jobs.ts';
import { aiSourceOf } from './ai-source.ts';
import { webInputsOf } from './ai-web-source.ts';
import type {
  ConfirmOutcome,
  PickPdfOutcome,
  ResumeImportService,
  SaveOutcome,
} from './service.ts';
import { safeDisplayName, toImportResult } from './to-result.ts';
import {
  MANUAL_RESULT,
  webCaptureLocal,
  webCaptureResult,
  type WebCaptureLocal,
} from './web-session.ts';

/** 使用者在系統選取器選到的檔案：只有檔名（不含上層路徑）與內容。 */
export interface PickedPdf {
  fileName: string;
  bytes: Uint8Array;
}

/** 系統檔案選取器（只限 PDF）；使用者取消回 null。 */
export type PdfFilePicker = () => Promise<PickedPdf | null>;

/** Profile repository 的讀寫：確認時要先看資料區已有幾份（Q8）。 */
export interface ProfileStore {
  save(profile: Profile): Profile;
  list(): Profile[];
}

export interface ResumeImportDeps {
  /** 沒有就不提供 import.pick_pdf（其他平台或尚未接上選取器） */
  picker?: PdfFilePicker;
  profiles: ProfileStore;
  extract?: (bytes: Uint8Array) => Promise<ExtractResult>;
  newId?: () => string;
  /** 記憶體內最多保留幾筆匯入（網頁、PDF、手動共用），超過丟最舊的（預設 20）。 */
  maxImports?: number;
  /** AI 整理（P1-T069）：選定模型與 R6 紀錄；沒給就不提供 AI 整理 */
  ai?: ImportAiDeps;
}

interface ImportEntry {
  result: ImportResult;
  /** 暫存的校正（未確認） */
  corrections: ProfileInput | null;
  /** AI 整理的輸入（PDF 解析失敗、網頁、手動為 null）；只在記憶體 */
  aiSource: AiSource | null;
  /** 網頁來源的網址與姓名元素文字：只在 helper 本機（P1-T080 遮蔽與預填用） */
  capture: WebCaptureLocal | null;
}

/** 個人資料、經歷、技能全空：沒有可寫入的內容。 */
function isEmptyProfile(profile: ProfileInput): boolean {
  const hasInfo = Object.values(profile.personalInfo).some((value) => /\S/u.test(value));
  return !hasInfo && profile.experiences.length === 0 && profile.skills.length === 0;
}

/** 這筆匯入要整理的來源：PDF 用解析出的行；網頁用區塊＋姓名來源（呼叫當下讀資料區 Profile）；手動沒有。 */
function aiJobOf(
  entry: ImportEntry,
  names: readonly string[],
  profiles: ProfileStore,
): AiJob | null {
  if (entry.result.status === 'web_capture' && entry.capture) {
    const inputs = webInputsOf(entry.result, entry.capture, profiles.list(), names);
    return { kind: 'web', inputs };
  }
  return entry.aiSource === null ? null : { kind: 'pdf', source: entry.aiSource };
}

export function createResumeImportService(deps: ResumeImportDeps): ResumeImportService {
  const extract = deps.extract ?? extractResumePdf;
  const newId = deps.newId ?? defaultNewId;
  const maxImports = deps.maxImports ?? 20;
  const imports = new Map<string, ImportEntry>();
  let picking = false;
  /** 最近一次網頁擷取的 importId；被擠出記憶體後 latestCapture 回 null */
  let latestWebId: string | null = null;
  const ai = deps.ai ? createAiParser(deps.ai) : null;
  const { picker } = deps;

  async function parse(picked: PickedPdf): Promise<Pick<ImportEntry, 'result' | 'aiSource'>> {
    const displayName = safeDisplayName(picked.fileName);
    try {
      const extracted = await extract(picked.bytes);
      return { result: toImportResult(displayName, extracted), aiSource: aiSourceOf(extracted) };
    } catch {
      // 解析器內部錯誤也當成「無法解析」，讓使用者能改手動輸入（D18），不中斷流程。
      return { result: { status: 'failed', displayName, reason: 'invalid_pdf' }, aiSource: null };
    }
  }

  function remember(entry: ImportEntry): string {
    const importId = newId();
    imports.set(importId, entry);
    while (imports.size > maxImports) {
      const oldest = imports.keys().next().value;
      if (oldest === undefined) break;
      imports.delete(oldest);
      ai?.forget(oldest);
    }
    return importId;
  }

  return {
    ...(picker && {
      async pickPdf(): Promise<PickPdfOutcome> {
        if (picking) return { status: 'busy' };
        picking = true;
        try {
          const picked = await picker();
          if (!picked) return { status: 'cancelled' };
          const parsed = await parse(picked);
          const importId = remember({ ...parsed, corrections: null, capture: null });
          return { status: 'selected', importId, displayName: parsed.result.displayName };
        } finally {
          picking = false;
        }
      },
    }),

    submitResumeCapture(capture) {
      // 只建立工作階段，不呼叫模型（Q4：網頁來源一律按「用AI整理」才呼叫）
      latestWebId = remember({
        result: webCaptureResult(capture),
        corrections: null,
        aiSource: null,
        capture: webCaptureLocal(capture),
      });
    },

    latestCapture(): ImportLatestCapture | null {
      const result = latestWebId === null ? undefined : imports.get(latestWebId)?.result;
      if (latestWebId === null || result?.status !== 'web_capture') return null;
      const { platform, capturedAt, truncated } = result;
      return { importId: latestWebId, platform, capturedAt, truncated };
    },

    startManual() {
      const importId = remember({
        result: MANUAL_RESULT,
        corrections: null,
        aiSource: null,
        capture: null,
      });
      return { importId };
    },

    get(importId) {
      return imports.get(importId)?.result ?? null;
    },

    saveCorrections(importId, profile): SaveOutcome {
      const entry = imports.get(importId);
      if (!entry) return { ok: false, reason: 'unknown_import' };
      entry.corrections = profile;
      return { ok: true };
    },

    confirm(importId, profile): ConfirmOutcome {
      const entry = imports.get(importId);
      if (!entry) return { ok: false, reason: 'unknown_import' };
      if (isEmptyProfile(profile)) return { ok: false, reason: 'empty_profile' };
      // Q8：已有一份就更新那一份（保留 id），沒有才新增；多份（舊資料）不寫入、不代為挑選
      const existing = uniqueProfile(deps.profiles.list());
      if (!existing.ok) return existing;
      const profileId = existing.profile?.id ?? newId();
      // 只寫請求帶來的內容（使用者確認當下看到的），不混入草稿或先前暫存的校正。
      deps.profiles.save({ ...profile, id: profileId, pdfParseConfirmed: true });
      entry.corrections = profile;
      return { ok: true, profileId };
    },

    ...(ai && {
      aiParse(importId: string, names: readonly string[] = []) {
        const entry = imports.get(importId);
        if (!entry) return Promise.resolve({ ok: false, reason: 'unknown_import' } as const);
        return ai.start(importId, aiJobOf(entry, names, deps.profiles));
      },
      aiStatus(importId: string) {
        if (!imports.has(importId)) return { ok: false, reason: 'unknown_import' } as const;
        return { ok: true, parse: ai.status(importId) } as const;
      },
    }),
  };
}
