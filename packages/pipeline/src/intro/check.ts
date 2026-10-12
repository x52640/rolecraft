/**
 * 投遞自介檢查（D25；確定性，生成與使用者編輯後共用）：任一不合就整份不採用、不修補、不截斷。
 * 1. 不可空白；字數（code point）不超過 INTRO_MAX_CHARS。
 * 2. 至少引用一項；引用只能是目前可用的事實項、不重複；功能／交付物必須標完成程度且不得高於事實項狀態
 *    （沿用履歷段落的 completionCap，D14：寫成已完成的必須是使用者確認完成）。
 * 3. 網址、網域、倍數／比例詞必須出現在所引用事實項的內容或使用者確認文字中；數字另可出自已確認的
 *    個人資料欄位（R1 檢查 3，與 domain 匯出前檢查同一組個人資料欄位）。正規化沿用 generation/grounding.ts。
 * 4. 不承諾面試時間、薪資、到職日，不寫聯絡方式（沿用 messages/commitments.ts）。
 * 5. 最後再過 domain 的 R1 匯出前檢查（當成一段生成段落、引用不可移除）。
 * 職缺公司、職稱可以出現（自介對象本來就是它）。
 */
import {
  INTRO_MAX_CHARS,
  introLength,
  type Claim,
  type ClaimCitation,
  type IntroProblem,
  type Profile,
} from '@rolecraft/contracts';
import { checkExportReadiness, extractNumbers, numberKeys } from '@rolecraft/domain';

import { completionCap, exceedsCap } from '../generation/completion.ts';
import {
  extractLooseUrls,
  extractMultipliers,
  fullUrls,
  normalizeForGrounding,
} from '../generation/grounding.ts';
import { claimLabel } from '../generation/prompt.ts';
import { commitmentProblem } from '../messages/commitments.ts';
import type { DraftProblem } from '../messages/types.ts';
import type { IntroOutput } from './types.ts';

export interface IntroCheckContext {
  /** 目前可用的事實項（usableClaims 之後；生成時順序即 C1、C2…） */
  readonly claims: readonly Claim[];
  /** 已確認的個人資料；沒有或未確認傳 null（數字就只認引用的事實項） */
  readonly profile: Profile | null;
}

export type IntroLabelResolution =
  | { readonly ok: true; readonly citations: ClaimCitation[] }
  | { readonly ok: false; readonly problem: IntroProblem };

/** 個人資料中可當數字出處的欄位（與 domain 匯出前檢查相同）。 */
export function profileTexts(profile: Profile | null): string[] {
  if (!profile?.pdfParseConfirmed) return [];
  return [
    ...Object.values(profile.personalInfo),
    ...profile.experiences.flatMap((e) => [
      e.company,
      e.title,
      e.startDate,
      e.endDate ?? '',
      e.description,
    ]),
    ...profile.skills,
  ];
}

/** 模型輸出的本機編號 → 事實項引用（只做存在與重複檢查，其餘交給 checkIntro）。 */
export function resolveIntroLabels(
  output: IntroOutput,
  claims: readonly Claim[],
): IntroLabelResolution {
  const byLabel = new Map(claims.map((claim, i) => [claimLabel(i), claim]));
  const citations: ClaimCitation[] = [];
  for (const citation of output.citations) {
    const claim = byLabel.get(citation.claim);
    if (!claim) return { ok: false, problem: 'unknown_claim' };
    if (citations.some((c) => c.claimId === claim.id)) {
      return { ok: false, problem: 'duplicate_citation' };
    }
    const stated = citation.statedCompletion;
    citations.push({ claimId: claim.id, ...(stated ? { statedCompletion: stated } : {}) });
  }
  return { ok: true, citations };
}

function citedClaims(
  citations: readonly ClaimCitation[],
  claims: readonly Claim[],
): Claim[] | IntroProblem {
  if (citations.length === 0) return 'no_citation';
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const cited: Claim[] = [];
  for (const { claimId, statedCompletion } of citations) {
    const claim = byId.get(claimId);
    if (!claim) return 'unknown_claim';
    if (cited.some((c) => c.id === claimId)) return 'duplicate_citation';
    const cap = completionCap(claim);
    if (cap === null && statedCompletion !== undefined) return 'completion_not_applicable';
    if (cap !== null && statedCompletion === undefined) return 'completion_not_stated';
    if (cap !== null && statedCompletion !== undefined && exceedsCap(statedCompletion, cap)) {
      return 'completion_exceeds_claim';
    }
    cited.push(claim);
  }
  return cited;
}

function groundingProblem(
  raw: string,
  cited: readonly Claim[],
  profile: Profile | null,
): IntroProblem | null {
  const rawSources = cited.flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? '']);
  const urls = new Set(rawSources.flatMap(fullUrls));
  if (fullUrls(raw).some((url) => !urls.has(url))) return 'link_not_grounded';
  const loose = new Set(rawSources.flatMap(extractLooseUrls));
  if (extractLooseUrls(raw).some((url) => !loose.has(url))) return 'link_not_grounded';
  const text = normalizeForGrounding(raw);
  const sources = rawSources.map(normalizeForGrounding);
  const numberSources = [...sources, ...profileTexts(profile).map(normalizeForGrounding)];
  const keys = numberKeys(numberSources.join('\n'));
  for (const token of extractNumbers(text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_grounded';
  }
  const multipliers = new Set(sources.flatMap(extractMultipliers));
  if (extractMultipliers(text).some((m) => !multipliers.has(m))) return 'multiplier_not_grounded';
  return null;
}

const COMMITMENTS: Partial<Record<DraftProblem, IntroProblem>> = {
  commits_time: 'commits_time',
  commits_salary: 'commits_salary',
  commits_start_date: 'commits_start_date',
  contact_info: 'contact_info',
};

function exportCheckPasses(
  text: string,
  citations: readonly ClaimCitation[],
  ctx: IntroCheckContext,
) {
  const section = {
    id: 'intro',
    origin: 'generated' as const,
    text,
    citations: [...citations],
    sectionConfirmation: null,
    generatedCitations: [...citations],
  };
  return checkExportReadiness({ sections: [section], claims: ctx.claims, profile: ctx.profile }).ok;
}

/** 檢查自介文字；通過回 null，否則回第一個問題。 */
export function checkIntro(
  text: string,
  citations: readonly ClaimCitation[],
  ctx: IntroCheckContext,
): IntroProblem | null {
  if (!/\S/u.test(text)) return 'empty';
  if (introLength(text) > INTRO_MAX_CHARS) return 'too_long';
  const cited = citedClaims(citations, ctx.claims);
  if (typeof cited === 'string') return cited;
  const grounding = groundingProblem(text, cited, ctx.profile);
  if (grounding) return grounding;
  const commitment = commitmentProblem(text);
  if (commitment) return COMMITMENTS[commitment] ?? 'export_check_failed';
  return exportCheckPasses(text, citations, ctx) ? null : 'export_check_failed';
}
