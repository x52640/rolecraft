import { z } from 'zod';

import { Id, NonEmptyText, Timestamp } from '../../entities/common.ts';
import { ResumeVersion } from '../../entities/resume-version.ts';
import { Ack, BridgeClaimCitation, MAX_IDS_PER_REQUEST, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * resume.*：客製履歷逐段對照、接受與匯出前檢查（F07、R1；P1-T025）。
 * 接受修改稿只接受措辭，不確認任何事實項（R1）。
 */

/** R1 檢查類別（對應 domain ExportCheckKind）。 */
export const BridgeExportCheckKind = z.enum([
  'citation_exists',
  'completion',
  'claim_usability',
  'numbers',
  'no_citation',
  'citation_integrity',
  'invalid_input',
]);
export type BridgeExportCheckKind = z.infer<typeof BridgeExportCheckKind>;

/** R1 問題代碼（對應 domain ExportIssueCode）。 */
export const BridgeExportIssueCode = z.enum([
  'claim_not_found',
  'completed_claim_not_found',
  'completion_not_stated',
  'completion_not_applicable',
  'completed_not_user_confirmed',
  'claim_unusable',
  'completed_confirmation_stale',
  'number_unsourced',
  'number_unparseable',
  'section_without_citation',
  'generated_citations_missing',
  'citation_removed',
  'invalid_section',
]);
export type BridgeExportIssueCode = z.infer<typeof BridgeExportIssueCode>;

/** 一則 R1 問題：哪段、哪條、原因，以及能否用逐段確認處理。 */
export const ExportIssueView = z.strictObject({
  sectionId: Id,
  check: BridgeExportCheckKind,
  code: BridgeExportIssueCode,
  claimId: Id.optional(),
  number: z.string().optional(),
  message: z.string(),
  resolvableBySectionConfirmation: z.boolean(),
});
export type ExportIssueView = z.infer<typeof ExportIssueView>;

/**
 * 匯出前除 R1 之外的段落阻擋（P1-T025）：生成段落要逐段把關（F07），
 * 尚未接受或已退回的段落不能匯出；缺段落歸屬或對不到 Profile 經歷的也不能（P1-T040）。
 */
export const SectionBlockReason = z.enum([
  'pending', // 修改稿尚未接受
  'rejected', // 已退回：要改寫後接受，或刪除整段
  'placement_missing', // 沒有段落歸屬
  'experience_not_found', // 段落歸屬對不到個人資料的工作經歷
]);
export type SectionBlockReason = z.infer<typeof SectionBlockReason>;

export const SectionBlockerView = z.strictObject({
  sectionId: Id,
  reason: SectionBlockReason,
  message: z.string(),
});
export type SectionBlockerView = z.infer<typeof SectionBlockerView>;

/** 段落原文（對照用）：工作經歷段落對到的 Profile 經歷描述；其他段落沒有原文。 */
export const SectionOriginalView = z.strictObject({ sectionId: Id, text: z.string() });
export type SectionOriginalView = z.infer<typeof SectionOriginalView>;

const VersionRef = z.strictObject({ resumeVersionId: OpaqueId });
const SectionRef = z.strictObject({ resumeVersionId: OpaqueId, sectionId: OpaqueId });

export const RESUME_SCHEMAS = {
  /** 針對已確認的職缺快照產生客製履歷；長工作（R9），回工作 id。 */
  'resume.generate': {
    request: bridgeOp('resume.generate', z.strictObject({ jobSnapshotId: OpaqueId })),
    response: withFailure(z.strictObject({ ok: z.literal(true), workJobId: Id })),
  },
  /** 列出某職缺的履歷版本。 */
  'resume.list': {
    request: bridgeOp('resume.list', z.strictObject({ jobSnapshotId: OpaqueId })),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        versions: z.array(z.strictObject({ resumeVersionId: Id, createdAt: Timestamp })),
      }),
    ),
  },
  'resume.get': {
    request: bridgeOp('resume.get', VersionRef),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        version: ResumeVersion,
        /** 有原文的段落才列（P1-T025） */
        originals: z.array(SectionOriginalView),
      }),
    ),
  },
  /** 接受修改稿（只接受措辭）。 */
  'resume.accept_section': {
    request: bridgeOp('resume.accept_section', SectionRef),
    response: withFailure(Ack),
  },
  /** 退回修改稿。 */
  'resume.reject_section': {
    request: bridgeOp('resume.reject_section', SectionRef),
    response: withFailure(Ack),
  },
  /**
   * 自行編輯段落。citations 是編輯後的完整引用；生成段落的引用只能增加不能移除（R1），
   * 要去掉引用只能刪整段（resume.delete_section）。違反時回 invalid_request。
   * 任一既有引用的宣稱完成程度被調低（例如已完成→進行中）時，必須帶
   * completionDowngradeAcknowledged: true（使用者已重看本段措辭），否則回 invalid_request（P1-T025）。
   */
  'resume.edit_section': {
    request: bridgeOp(
      'resume.edit_section',
      SectionRef.extend({
        text: z.string(),
        citations: z.array(BridgeClaimCitation).max(MAX_IDS_PER_REQUEST),
        completionDowngradeAcknowledged: z.literal(true).optional(),
      }),
    ),
    response: withFailure(Ack),
  },
  'resume.delete_section': {
    request: bridgeOp('resume.delete_section', SectionRef),
    response: withFailure(Ack),
  },
  /**
   * 逐段確認「本段內容屬實」：text 必須等於該段目前全文，helper 記錄時間與全文（R1）。
   * 檢查 2 不通過的段落不能用逐段確認放行（由 domain 判定）。
   */
  'resume.confirm_section': {
    request: bridgeOp('resume.confirm_section', SectionRef.extend({ text: NonEmptyText })),
    response: withFailure(Ack),
  },
  /**
   * 匯出前檢查；ready 為 false 時不得匯出。ready＝R1 通過且沒有段落阻擋（blockers，P1-T025）。
   */
  'resume.check_export': {
    request: bridgeOp('resume.check_export', VersionRef),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        ready: z.boolean(),
        issues: z.array(ExportIssueView),
        blockers: z.array(SectionBlockerView),
      }),
    ),
  },
} as const;
