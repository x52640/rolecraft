/**
 * 三種使用者動作（R1），意義不同、不可互相替代：
 * - 接受修改稿：只換措辭，不確認任何事實項。
 * - 確認事實項：逐項確認，記錄時間與當下文字。
 * - 逐段確認：使用者表示「本段內容屬實」，記錄時間與該段全文。
 * 另含引用編輯：只能增加引用。
 */
import {
  CLAIM_TYPES_WITH_COMPLETION,
  Claim,
  ResumeSection,
  Timestamp,
  type ClaimCitation,
} from '@rolecraft/contracts';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail<T>(reason: string): ActionResult<T> {
  return { ok: false, reason };
}

/**
 * 接受修改稿：只替換段落文字。引用保留不動；事實項不受影響（本函式拿不到事實項）。
 * 文字有變時舊的逐段確認不再適用，清掉。
 */
export function acceptRevision(section: ResumeSection, revisedText: string): ResumeSection {
  return {
    ...section,
    text: revisedText,
    sectionConfirmation: revisedText === section.text ? section.sectionConfirmation : null,
  };
}

/** 使用者對功能／交付物可確認的完成狀態；「文件標示完成」「未知」不是使用者確認的結果。 */
export type ConfirmableCompletion = 'user_confirmed_done' | 'planned';

export interface ConfirmClaimInput {
  readonly confirmedAt: string;
  /** 功能、交付物必填；其他類型不得給 */
  readonly completion?: ConfirmableCompletion;
  /** 確認時一併修正的內容；省略則確認現有內容 */
  readonly text?: string;
}

/**
 * 確認事實項：記錄確認時間與確認當下的文字。待複核、來源矛盾經確認後回到正常；
 * 來源已移除的維持標示（R2）。
 */
export function confirmClaim(claim: Claim, input: ConfirmClaimInput): ActionResult<Claim> {
  if (!Timestamp.safeParse(input.confirmedAt).success) return fail('確認時間格式不正確');
  const hasCompletion = CLAIM_TYPES_WITH_COMPLETION.includes(claim.type);
  if (hasCompletion && input.completion === undefined) {
    return fail('功能與交付物確認時必須指定完成狀態');
  }
  if (!hasCompletion && input.completion !== undefined) {
    return fail('這類事實項沒有完成狀態');
  }
  const text = input.text ?? claim.text;
  const next: Claim = {
    ...claim,
    text,
    basis: { ...claim.basis, userConfirmation: { confirmedAt: input.confirmedAt, text } },
    reviewStatus: claim.reviewStatus === 'source_removed' ? 'source_removed' : 'normal',
  };
  if (input.completion !== undefined) next.completionStatus = input.completion;
  const parsed = Claim.safeParse(next);
  return parsed.success ? { ok: true, value: parsed.data } : fail('確認後的事實項不符格式');
}

/** 逐段確認：記錄時間與該段全文。之後文字一改，確認即失效（匯出檢查比對全文）。 */
export function confirmSection(
  section: ResumeSection,
  confirmedAt: string,
): ActionResult<ResumeSection> {
  if (!Timestamp.safeParse(confirmedAt).success) return fail('確認時間格式不正確');
  if (section.text.trim() === '') return fail('空白段落不需確認');
  const next: ResumeSection = {
    ...section,
    sectionConfirmation: { confirmedAt, text: section.text },
  };
  const parsed = ResumeSection.safeParse(next);
  return parsed.success ? { ok: true, value: parsed.data } : fail('確認後的段落不符格式');
}

/** 增加引用。已引用同一事實項時拒絕（改完成程度請改寫該引用，不是重複引用）。 */
export function addCitation(
  section: ResumeSection,
  citation: ClaimCitation,
): ActionResult<ResumeSection> {
  if (section.citations.some((c) => c.claimId === citation.claimId)) {
    return fail('這段已經引用該事實項');
  }
  return { ok: true, value: { ...section, citations: [...section.citations, { ...citation }] } };
}
