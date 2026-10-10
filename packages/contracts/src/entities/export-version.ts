import { z } from 'zod';

import { ContentHash, Id, Timestamp } from './common.ts';
import { JobSnapshot } from './job-snapshot.ts';
import { CitedClaimCopy, ResumeSection } from './resume-version.ts';

/**
 * 不可變的匯出版本（R3）：履歷全文、PDF 雜湊、引用事實項與片段原文副本、當時職缺快照副本。
 * 之後的編輯都產生新版本，不改舊版。PDF 檔本身由 storage 保存，這裡只記雜湊。
 */
export const ExportVersion = z.strictObject({
  id: Id,
  resumeVersionId: Id,
  exportedAt: Timestamp,
  /** 履歷全文（匯出當下各段副本） */
  sections: z.array(ResumeSection),
  pdfHash: ContentHash,
  citedClaims: z.array(CitedClaimCopy),
  jobSnapshot: JobSnapshot,
});
export type ExportVersion = z.infer<typeof ExportVersion>;
