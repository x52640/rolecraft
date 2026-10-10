/** R1 匯出前檢查的結構化結果：哪段、哪條、原因。 */

/** 檢查類別。 */
export type ExportCheckKind =
  | 'citation_exists' // 檢查 1：引用的事實項存在
  | 'completion' // 檢查 2：宣稱完成程度合法（D14）
  | 'numbers' // 檢查 3：數字有出處
  | 'no_citation' // 沒有任何引用的段落
  | 'citation_integrity' // 生成段落的引用被移除或生成紀錄缺失
  | 'invalid_input'; // 資料不符 contracts schema

export type ExportIssueCode =
  | 'claim_not_found'
  | 'completed_claim_not_found'
  | 'completion_not_stated'
  | 'completion_not_applicable'
  | 'completed_not_user_confirmed'
  | 'completed_under_review'
  | 'completed_confirmation_stale'
  | 'number_unsourced'
  | 'number_unparseable'
  | 'section_without_citation'
  | 'generated_citations_missing'
  | 'citation_removed'
  | 'invalid_section';

export interface ExportIssue {
  readonly sectionId: string;
  readonly check: ExportCheckKind;
  readonly code: ExportIssueCode;
  readonly claimId?: string;
  /** 檢查 3：段落中找不到出處的數字原文 */
  readonly number?: string;
  readonly message: string;
  /**
   * 能否用逐段確認處理。檢查 2 與引用完整性一律不行（R1），
   * 只能改寫、刪除或到事實項上確認。
   */
  readonly resolvableBySectionConfirmation: boolean;
}

export interface ExportCheckResult {
  /** 沒有任何未處理問題才可匯出 */
  readonly ok: boolean;
  readonly issues: readonly ExportIssue[];
}

/** 會被逐段確認放行的類別（檢查 1、3 與無引用段落）。 */
export const SECTION_CONFIRMABLE: ReadonlySet<ExportCheckKind> = new Set<ExportCheckKind>([
  'citation_exists',
  'numbers',
  'no_citation',
]);
