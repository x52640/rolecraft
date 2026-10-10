// 履歷 PDF 匯入服務（F02、R10、D18）：選檔 → 本機解析 → 暫存校正 → 使用者確認後寫入 Profile。
// 檔案只從注入的系統選取器進來（helper 自己開，請求不帶路徑；R7、ADR-0003），
// 完整路徑不經過本服務；解析結果只留在記憶體，原始 PDF 內容解析完就丟。
import type { ImportResult, Profile, ProfileInput } from '@rolecraft/contracts';
import { extractResumePdf, type ExtractResult } from '@rolecraft/resume-import';
import { newId as defaultNewId } from '@rolecraft/storage';

import type {
  ConfirmOutcome,
  PickPdfOutcome,
  ResumeImportService,
  SaveOutcome,
} from './service.ts';
import { safeDisplayName, toImportResult } from './to-result.ts';

/** 使用者在系統選取器選到的檔案：只有檔名（不含上層路徑）與內容。 */
export interface PickedPdf {
  fileName: string;
  bytes: Uint8Array;
}

/** 系統檔案選取器（只限 PDF）；使用者取消回 null。 */
export type PdfFilePicker = () => Promise<PickedPdf | null>;

/** 只需要 Profile repository 的寫入。 */
export interface ProfileSink {
  save(profile: Profile): Profile;
}

export interface ResumeImportDeps {
  picker: PdfFilePicker;
  profiles: ProfileSink;
  extract?: (bytes: Uint8Array) => Promise<ExtractResult>;
  newId?: () => string;
  /** 記憶體內最多保留幾筆匯入，超過丟最舊的（預設 20）。 */
  maxImports?: number;
}

interface ImportEntry {
  result: ImportResult;
  /** 暫存的校正（未確認） */
  corrections: ProfileInput | null;
  /** 確認過就記住，同一筆匯入再確認時覆寫同一份 Profile */
  profileId: string | null;
}

/** 個人資料、經歷、技能全空：沒有可寫入的內容。 */
function isEmptyProfile(profile: ProfileInput): boolean {
  const hasInfo = Object.values(profile.personalInfo).some((value) => /\S/u.test(value));
  return !hasInfo && profile.experiences.length === 0 && profile.skills.length === 0;
}

export function createResumeImportService(deps: ResumeImportDeps): ResumeImportService {
  const extract = deps.extract ?? extractResumePdf;
  const newId = deps.newId ?? defaultNewId;
  const maxImports = deps.maxImports ?? 20;
  const imports = new Map<string, ImportEntry>();
  let picking = false;

  async function parse(picked: PickedPdf): Promise<ImportResult> {
    const displayName = safeDisplayName(picked.fileName);
    try {
      return toImportResult(displayName, await extract(picked.bytes));
    } catch {
      // 解析器內部錯誤也當成「無法解析」，讓使用者能改手動輸入（D18），不中斷流程。
      return { status: 'failed', displayName, reason: 'invalid_pdf' };
    }
  }

  function remember(entry: ImportEntry): string {
    const importId = newId();
    imports.set(importId, entry);
    while (imports.size > maxImports) {
      const oldest = imports.keys().next().value;
      if (oldest === undefined) break;
      imports.delete(oldest);
    }
    return importId;
  }

  return {
    async pickPdf(): Promise<PickPdfOutcome> {
      if (picking) return { status: 'busy' };
      picking = true;
      try {
        const picked = await deps.picker();
        if (!picked) return { status: 'cancelled' };
        const result = await parse(picked);
        const importId = remember({ result, corrections: null, profileId: null });
        return { status: 'selected', importId, displayName: result.displayName };
      } finally {
        picking = false;
      }
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
      const profileId = entry.profileId ?? newId();
      // 只寫請求帶來的內容（使用者確認當下看到的），不混入草稿或先前暫存的校正。
      deps.profiles.save({ ...profile, id: profileId, pdfParseConfirmed: true });
      entry.profileId = profileId;
      entry.corrections = profile;
      return { ok: true, profileId };
    },
  };
}
