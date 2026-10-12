/**
 * 投遞自介檢查（D25；確定性，生成與使用者編輯後共用）：任一不合就整份不採用、不修補、不截斷。
 * 1. 不可空白；字數（code point）不超過 INTRO_MAX_CHARS。
 * 2. 至少引用一項；引用只能是目前可用的事實項、不重複；功能／交付物必須標完成程度且不得高於事實項狀態
 *    （沿用履歷段落的 completionCap，D14：寫成已完成的必須是使用者確認完成）。
 * 3. 網址、網域、倍數／比例詞必須出現在所引用事實項的內容或使用者確認文字中；數字另可出自已確認的
 *    個人資料欄位（R1 檢查 3，與 domain 匯出前檢查同一組個人資料欄位）。正規化沿用 generation/grounding.ts。
 * 4. 不承諾面試時間、薪資、到職日，不寫聯絡方式（沿用 messages/commitments.ts）：D25 擁有者裁定只擋模型產生的
 *    內容（introCommitmentWarning，由 run.ts 套用）；使用者編輯後只提示，不算 checkIntro 的問題。
 * 5. 最後再過 domain 的 R1 匯出前檢查（當成一段生成段落、引用不可移除）。
 * 沒通過時另可取出問題片段（沒有出處的網址、數字、倍數詞），標在未通過的草稿上（P1-T071）。
 * 職缺公司、職稱可以出現（自介對象本來就是它）。
 */
import {
  INTRO_DRAFT_FRAGMENTS,
  INTRO_MAX_CHARS,
  introLength,
  type Claim,
  type ClaimCitation,
  type IntroCommitmentWarning,
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
  /**
   * 已確認職缺快照的公司名稱與職稱（沒有或未確認就不給）：自介裡出現的這兩段文字整段不算數字，
   * 名稱裡的數字（例如「104」）因此有出處；名稱以外的同一個數字仍要有出處。
   */
  readonly jobNames?: readonly string[];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 把自介中出現的公司名稱、職稱整段換成空白（正規化後比對，長的先換）；只用於數字檢查。
 * 要有邊界：前後緊鄰英數字的不算名稱（名稱「3M」不會豁免「13M」「3MB」裡的 3M），只豁免名稱本身。
 */
export function withoutJobNames(text: string, names: readonly string[] = []): string {
  const normalized = names
    .map((name) => normalizeForGrounding(name).trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length);
  return normalized.reduce((out, name) => {
    const bounded = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, 'gu');
    return out.replace(bounded, ' ');
  }, normalizeForGrounding(text));
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
): Claim[] | IntroCheckProblem {
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

interface GroundingIssue {
  readonly problem: IntroCheckProblem;
  /** 沒有出處的片段（網址、數字、倍數詞；取自自介文字，P1-T071 標在草稿上） */
  readonly fragments: readonly string[];
}

function groundingIssue(
  raw: string,
  cited: readonly Claim[],
  ctx: IntroCheckContext,
): GroundingIssue | null {
  const { profile } = ctx;
  const rawSources = cited.flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? '']);
  const urls = new Set(rawSources.flatMap(fullUrls));
  const badUrls = fullUrls(raw).filter((url) => !urls.has(url));
  if (badUrls.length > 0) return { problem: 'link_not_grounded', fragments: badUrls };
  const loose = new Set(rawSources.flatMap(extractLooseUrls));
  const badLoose = extractLooseUrls(raw).filter((url) => !loose.has(url));
  if (badLoose.length > 0) return { problem: 'link_not_grounded', fragments: badLoose };
  const text = normalizeForGrounding(raw);
  const sources = rawSources.map(normalizeForGrounding);
  const numberSources = [...sources, ...profileTexts(profile).map(normalizeForGrounding)];
  const keys = numberKeys(numberSources.join('\n'));
  const numberText = withoutJobNames(raw, ctx.jobNames);
  const badNumbers = extractNumbers(numberText).filter((t) => t.key === null || !keys.has(t.key));
  if (badNumbers.length > 0) {
    return { problem: 'number_not_grounded', fragments: badNumbers.map((t) => t.text) };
  }
  const multipliers = new Set(sources.flatMap(extractMultipliers));
  const badMultipliers = extractMultipliers(text).filter((m) => !multipliers.has(m));
  if (badMultipliers.length > 0) {
    return { problem: 'multiplier_not_grounded', fragments: badMultipliers };
  }
  return null;
}

const COMMITMENTS: Partial<Record<DraftProblem, IntroCommitmentWarning>> = {
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
    // 公司名稱、職稱整段先拿掉：名稱裡的數字不算（R1 數字檢查與 groundingIssue 一致）
    text: withoutJobNames(text, ctx.jobNames),
    citations: [...citations],
    sectionConfirmation: null,
    generatedCitations: [...citations],
  };
  return checkExportReadiness({ sections: [section], claims: ctx.claims, profile: ctx.profile }).ok;
}

/** R1 類問題（會停用複製）；承諾字眼另由 introCommitmentWarning 判定。 */
export type IntroCheckProblem = Exclude<IntroProblem, IntroCommitmentWarning>;

/** 承諾字眼或聯絡方式；模型產生時整份不採用，使用者編輯後只提示。 */
export function introCommitmentWarning(text: string): IntroCommitmentWarning | null {
  const commitment = commitmentProblem(text);
  return commitment ? (COMMITMENTS[commitment] ?? null) : null;
}

/** 檢查自介文字（不含承諾字眼）；通過回 null，否則回第一個問題。 */
export function checkIntro(
  text: string,
  citations: readonly ClaimCitation[],
  ctx: IntroCheckContext,
): IntroCheckProblem | null {
  // 只有零寬、格式字元等不可見字元也算空白（對抗驗證）
  if (!/\S/u.test(normalizeForGrounding(text))) return 'empty';
  if (introLength(text) > INTRO_MAX_CHARS) return 'too_long';
  const cited = citedClaims(citations, ctx.claims);
  if (typeof cited === 'string') return cited;
  const grounding = groundingIssue(text, cited, ctx);
  if (grounding) return grounding.problem;
  return exportCheckPasses(text, citations, ctx) ? null : 'export_check_failed';
}

/** 模型內容的檢查（D25）：checkIntro 之外，承諾字眼與聯絡方式也整份不採用。未通過草稿儲存時也用它（P1-T071）。 */
export function checkModelIntro(
  text: string,
  citations: readonly ClaimCitation[],
  ctx: IntroCheckContext,
): IntroProblem | null {
  return checkIntro(text, citations, ctx) ?? introCommitmentWarning(text);
}

/** 問題片段（P1-T071）：只有問題是網址、數字、倍數詞沒有出處時有；去重、限制筆數與長度。 */
export function introProblemFragments(
  text: string,
  citations: readonly ClaimCitation[],
  ctx: IntroCheckContext,
  problem: IntroProblem,
): string[] {
  const cited = citedClaims(citations, ctx.claims);
  if (typeof cited === 'string') return [];
  const issue = groundingIssue(text, cited, ctx);
  if (issue?.problem !== problem) return [];
  const { fragments } = issue;
  const { max, maxChars } = INTRO_DRAFT_FRAGMENTS;
  return [...new Set(fragments.map((f) => [...f].slice(0, maxChars).join('').trim()))]
    .filter((f) => f.length > 0)
    .slice(0, max);
}

/** 草稿用的引用：只留存在、不重複的本機編號（resolveIntroLabels 失敗時也要能保留草稿）。 */
export function lenientIntroLabels(output: IntroOutput, claims: readonly Claim[]): ClaimCitation[] {
  const byLabel = new Map(claims.map((claim, i) => [claimLabel(i), claim]));
  const citations: ClaimCitation[] = [];
  for (const { claim: label, statedCompletion } of output.citations) {
    const claim = byLabel.get(label);
    if (!claim || citations.some((c) => c.claimId === claim.id)) continue;
    citations.push({ claimId: claim.id, ...(statedCompletion ? { statedCompletion } : {}) });
  }
  return citations;
}
