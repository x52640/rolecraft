// export.create（P1-T040，R1、R3）：
// 讀一次履歷版本 → 凍結成快照 → 對快照跑 R1 → 用「同一份快照」組文件 → 匯出 PDF → 建立不可變匯出版本。
// 快照之後不再讀資料庫裡的履歷版本，所以檢查後就算版本被改，印出的也只會是檢查過的內容。
// 匯出不等於投遞（R3）；這裡不建立任何投遞紀錄。
import type {
  BridgeErrorCode,
  BridgeFailure,
  BridgeResponseOf,
  CitedClaimCopy,
  Claim,
  Profile,
  ResumeSection,
  ResumeVersion,
} from '@rolecraft/contracts';
import { checkExportReadiness } from '@rolecraft/domain';
import {
  exportResumePdf,
  isBlocking,
  PdfExportError,
  type FontSet,
  type PdfExportOutcome,
  type PdfExportRequest,
} from '@rolecraft/pdf-export';
import { StorageError, type ExportVersionRepository, type Repositories } from '@rolecraft/storage';

import { buildResumeDocument, type DocumentProblem } from './document.ts';
import { fitsChunkLimit } from './chunks.ts';

export interface ExportCreateDeps {
  readonly repos: Pick<Repositories, 'profiles' | 'claims' | 'jobSnapshots' | 'resumeVersions'>;
  readonly exports: Pick<ExportVersionRepository, 'create'>;
  /** 隨附字型（安裝時放在固定資料夾，見 services/runtime.ts） */
  readonly loadFonts: () => Promise<FontSet>;
  /** 測試可換成假的；正式為 pdf-export 的 exportResumePdf */
  readonly exportPdf?: (request: PdfExportRequest) => Promise<PdfExportOutcome>;
}

type CreateResponse = BridgeResponseOf<'export.create'>;

const fail = (code: BridgeErrorCode, message: string): BridgeFailure => ({
  ok: false,
  error: { code, message },
});

const DOCUMENT_MESSAGES: Record<DocumentProblem['reason'], string> = {
  profile_name_missing: '個人資料缺少姓名，無法匯出',
  placement_missing: '有段落尚未指定放在履歷哪一區，無法匯出',
  experience_not_found: '有段落對不到個人資料中的工作經歷，無法匯出',
};

const PDF_ERROR_MESSAGES: Record<string, string> = {
  fonts_unavailable: '匯出用字型無法使用',
  browser_not_found: '找不到 Google Chrome，無法匯出 PDF',
  browser_failed: 'Chrome 列印失敗或逾時',
  pdf_unreadable: '產出的 PDF 無法讀回檢查',
};

/** 深度凍結（快照只讀；之後任何人改它都會在嚴格模式下丟錯）。 */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** 唯一的使用者個人資料；必須已經使用者確認（R10），因為公司、職稱、日期直接照印。 */
function confirmedProfile(profiles: Profile[]): Profile | BridgeFailure {
  if (profiles.length !== 1) return fail('invalid_request', '尚未建立個人資料，無法匯出');
  const [profile] = profiles;
  if (profile === undefined || !profile.pdfParseConfirmed) {
    return fail('invalid_request', '個人資料尚未確認，無法匯出');
  }
  return profile;
}

function citedClaimIds(sections: readonly ResumeSection[]): string[] {
  return [...new Set(sections.flatMap((s) => s.citations.map((c) => c.claimId)))];
}

function copyOf(claim: Claim): CitedClaimCopy {
  return {
    claimId: claim.id,
    claimText: claim.text,
    excerptTexts: claim.basis.sourceExcerpts.map((e) => e.text),
  };
}

function pdfFailure(error: unknown): BridgeFailure {
  if (error instanceof PdfExportError) {
    return fail('internal_error', PDF_ERROR_MESSAGES[error.code] ?? 'PDF 匯出失敗');
  }
  throw error;
}

export async function createExport(
  deps: ExportCreateDeps,
  resumeVersionId: string,
): Promise<CreateResponse> {
  const stored = deps.repos.resumeVersions.get(resumeVersionId);
  if (stored === null) return fail('invalid_request', '找不到這個履歷版本');
  // 唯一一次讀履歷版本；R1、文件、匯出版本全部用這份快照。
  const version: ResumeVersion = deepFreeze(structuredClone(stored));

  const jobSnapshot = deps.repos.jobSnapshots.get(version.jobSnapshotId);
  if (jobSnapshot === null) return fail('internal_error', '找不到履歷版本對應的職缺快照');
  const profile = confirmedProfile(deps.repos.profiles.list());
  if ('ok' in profile) return profile;

  const claims = deepFreeze(
    citedClaimIds(version.sections).flatMap((id) => {
      const claim = deps.repos.claims.get(id);
      return claim === null ? [] : [claim];
    }),
  );
  const r1 = checkExportReadiness({ sections: version.sections, claims, profile });
  if (!r1.ok) return { ok: true, outcome: { status: 'not_ready' } };

  const built = buildResumeDocument(profile, version.sections);
  if (!built.ok) return fail('invalid_request', DOCUMENT_MESSAGES[built.problem.reason]);

  let outcome: PdfExportOutcome;
  try {
    const fonts = await deps.loadFonts();
    outcome = await (deps.exportPdf ?? exportResumePdf)({ r1, document: built.document, fonts });
  } catch (error) {
    return pdfFailure(error);
  }
  if (!outcome.ok) {
    const codes = [...new Set(outcome.report.issues.filter(isBlocking).map((i) => i.code))];
    return fail('internal_error', `PDF 檢查未通過：${codes.join('、')}`);
  }
  if (!fitsChunkLimit(outcome.pdf.byteLength)) {
    return fail('internal_error', 'PDF 太大，無法經橋接讀取');
  }

  const printedIds = new Set(citedClaimIds(built.printedSections));
  try {
    const created = deps.exports.create(
      {
        resumeVersionId: version.id,
        sections: [...built.printedSections],
        citedClaims: claims.filter((c) => printedIds.has(c.id)).map(copyOf),
        jobSnapshot,
      },
      outcome.pdf,
    );
    return { ok: true, outcome: { status: 'exported', exportVersionId: created.id } };
  } catch (error) {
    // 例：內容含使用者已刪除的素材（D19），storage 拒絕建立
    if (error instanceof StorageError) return fail('internal_error', '無法建立匯出版本');
    throw error;
  }
}
