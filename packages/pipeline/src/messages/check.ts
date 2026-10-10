/**
 * 草稿檢查（生成端，確定性）：任一不合就整份丟棄、不修補、不降級。
 * 1. 引用只能是這次提供的可用事實項編號，不可重複（D4、R1）。
 * 2. 草稿中的網址、網域、數字、倍數／比例詞，必須出現在所引用事實項的內容或使用者確認文字中
 *    （規則比照履歷段落生成 generation/grounding.ts；沒有引用就一個都不能有）。
 * 3. 不得提到時間／日期、薪資、到職日（F08：不擅自承諾；commitments.ts）。
 * 職缺公司、職稱可以出現在回覆中（回覆對象本來就是它），所以不套用段落生成的「不寫職缺身分」規則。
 */
import type { Claim, Id } from '@rolecraft/contracts';
import { extractNumbers, numberKeys } from '@rolecraft/domain';

import { extractUrls } from '../analysis/urls.ts';
import { claimLabel } from '../generation/prompt.ts';
import {
  extractLooseUrls,
  extractMultipliers,
  normalizeForGrounding,
} from '../generation/grounding.ts';
import { commitmentProblem } from './commitments.ts';
import type { DraftOutput, DraftProblem, DraftResult, ReplyIntent } from './types.ts';

export interface DraftCheckContext {
  readonly messageDraftId: Id;
  readonly intent: ReplyIntent;
  /** 提示中的事實項（順序即 C1、C2…） */
  readonly claims: readonly Claim[];
}

export type DraftCheck =
  | { readonly ok: true; readonly result: DraftResult }
  | { readonly ok: false; readonly problem: DraftProblem };

/** 數字、網址、倍數詞只能來自引用的事實項。 */
export function draftGroundingProblem(raw: string, cited: readonly Claim[]): DraftProblem | null {
  const text = normalizeForGrounding(raw);
  const sources = cited
    .flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? ''])
    .map(normalizeForGrounding);
  const urls = new Set(sources.flatMap(extractUrls));
  if (extractUrls(text).some((url) => !urls.has(url))) return 'link_not_in_claims';
  const loose = new Set(sources.flatMap(extractLooseUrls));
  if (extractLooseUrls(text).some((url) => !loose.has(url))) return 'link_not_in_claims';
  const keys = numberKeys(sources.join('\n'));
  for (const token of extractNumbers(text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_claims';
  }
  const multipliers = new Set(sources.flatMap(extractMultipliers));
  if (extractMultipliers(text).some((m) => !multipliers.has(m))) return 'multiplier_not_in_claims';
  return null;
}

export function checkDraft(output: DraftOutput, context: DraftCheckContext): DraftCheck {
  const byLabel = new Map(context.claims.map((claim, i) => [claimLabel(i), claim]));
  if (new Set(output.citations).size !== output.citations.length) {
    return { ok: false, problem: 'duplicate_citation' };
  }
  const cited: Claim[] = [];
  for (const label of output.citations) {
    const claim = byLabel.get(label);
    if (!claim) return { ok: false, problem: 'unknown_claim' };
    cited.push(claim);
  }
  const problem = draftGroundingProblem(output.draft, cited) ?? commitmentProblem(output.draft);
  if (problem) return { ok: false, problem };
  return {
    ok: true,
    result: {
      messageDraftId: context.messageDraftId,
      replyIntent: context.intent,
      draft: output.draft,
      citedClaimIds: cited.map((claim) => claim.id),
    },
  };
}
