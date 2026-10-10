/**
 * 模型輸出 → 履歷版本（R1、D4、D14）。逐段對照事實項，任何一項不合就丟棄整段（不修補、不降級）：
 * - 引用必須指向這次提供的可用事實項；功能／交付物必須標完成程度且不得高於事實項狀態。
 * - 文字中的數字與網址必須出現在所引用事實項的內容（或使用者確認文字）中。
 * - 最後再過 domain 的 R1 匯出前檢查（不帶 Profile：數字只認引用的事實項）。
 * 經歷段落的公司、職稱、日期、原文從 Profile 帶入，不採用模型的任何文字。
 */
import {
  ResumeVersion,
  type Claim,
  type ClaimCitation,
  type Id,
  type Profile,
  type ResumeSection,
} from '@rolecraft/contracts';
import { checkExportReadiness, extractNumbers, numberKeys } from '@rolecraft/domain';

import { extractUrls } from '../analysis/urls.ts';
import { completionCap, exceedsCap } from './completion.ts';
import { claimLabel, experienceLabel } from './prompt.ts';
import type {
  DroppedSection,
  GenerationOutput,
  GenerationResult,
  InformationGap,
  RequirementMatch,
  SectionDraft,
  SectionDropReason,
  SectionPlacement,
} from './types.ts';

export interface SectionContext {
  readonly jobSnapshotId: Id;
  /** 提示中提供的可用事實項，順序即 C1、C2… */
  readonly claims: readonly Claim[];
  readonly profile: Profile;
  readonly newId: () => Id;
  /** ISO 時間（版本時間） */
  readonly createdAt: string;
}

export type SectionConversion =
  | { readonly ok: true; readonly result: GenerationResult }
  | { readonly ok: false; readonly error: string };

function placementOf(draft: SectionDraft, profile: Profile): SectionPlacement | null {
  if (draft.placement === 'summary' || draft.placement === 'project') {
    return { kind: draft.placement };
  }
  const index = profile.experiences.findIndex((_, i) => experienceLabel(i) === draft.placement);
  const experience = profile.experiences[index];
  if (!experience) return null;
  return {
    kind: 'experience',
    experienceIndex: index,
    company: experience.company,
    title: experience.title,
    startDate: experience.startDate,
    endDate: experience.endDate,
    originalText: experience.description,
  };
}

function claimByLabel(claims: readonly Claim[]): Map<string, Claim> {
  return new Map(claims.map((claim, i) => [claimLabel(i), claim]));
}

/** 引用檢查；通過回傳引用與被引用的事實項，否則回傳丟棄原因。 */
function resolveCitations(
  draft: SectionDraft,
  byLabel: ReadonlyMap<string, Claim>,
): { citations: ClaimCitation[]; cited: Claim[] } | SectionDropReason {
  if (draft.citations.length === 0) return 'no_citation';
  const citations: ClaimCitation[] = [];
  const cited: Claim[] = [];
  for (const citation of draft.citations) {
    const claim = byLabel.get(citation.claim);
    if (!claim) return 'unknown_claim';
    if (cited.some((c) => c.id === claim.id)) return 'duplicate_citation';
    const cap = completionCap(claim);
    const stated = citation.statedCompletion;
    if (cap === null && stated !== undefined) return 'completion_not_applicable';
    if (cap !== null && stated === undefined) return 'completion_not_stated';
    if (cap !== null && stated !== undefined && exceedsCap(stated, cap)) {
      return 'completion_exceeds_claim';
    }
    cited.push(claim);
    citations.push({ claimId: claim.id, ...(stated ? { statedCompletion: stated } : {}) });
  }
  return { citations, cited };
}

/** 數字與網址只能來自引用的事實項內容與使用者確認文字。 */
function groundingProblem(text: string, cited: readonly Claim[]): SectionDropReason | null {
  const sources = cited.flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? '']);
  const urls = new Set(sources.flatMap(extractUrls));
  if (extractUrls(text).some((url) => !urls.has(url))) return 'link_not_in_claims';
  const keys = numberKeys(sources.join('\n'));
  for (const token of extractNumbers(text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_claims';
  }
  return null;
}

function convertSection(
  draft: SectionDraft,
  ctx: SectionContext,
  byLabel: ReadonlyMap<string, Claim>,
): { section: ResumeSection; placement: SectionPlacement } | SectionDropReason {
  const placement = placementOf(draft, ctx.profile);
  if (!placement) return 'unknown_placement';
  const resolved = resolveCitations(draft, byLabel);
  if (typeof resolved === 'string') return resolved;
  const problem = groundingProblem(draft.text, resolved.cited);
  if (problem) return problem;
  const section: ResumeSection = {
    id: ctx.newId(),
    origin: 'generated',
    text: draft.text,
    citations: resolved.citations,
    sectionConfirmation: null,
    generatedCitations: resolved.citations.map((c) => ({ ...c })),
    rationale: draft.rationale,
    decision: 'pending',
  };
  const check = checkExportReadiness({ sections: [section], claims: ctx.claims, profile: null });
  if (!check.ok) return 'export_check_failed';
  return { section, placement };
}

function convertMatches(
  output: GenerationOutput,
  byLabel: ReadonlyMap<string, Claim>,
): { matches: RequirementMatch[]; dropped: number[] } {
  const matches: RequirementMatch[] = [];
  const dropped: number[] = [];
  output.matches.forEach((match, index) => {
    const claims = match.claims.map((label) => byLabel.get(label));
    const ids = claims.flatMap((c) => (c ? [c.id] : []));
    // 沒有證據、或引用了不存在的事實項：丟棄這筆匹配（不猜）
    if (ids.length === 0 || ids.length !== claims.length) {
      dropped.push(index);
      return;
    }
    matches.push({ requirement: match.requirement, claimIds: [...new Set(ids)] });
  });
  return { matches, dropped };
}

/** 把通過格式驗證的輸出轉成履歷版本；沒有任何段落留下時整份失敗（不寫入）。 */
export function convertGeneration(
  output: GenerationOutput,
  ctx: SectionContext,
): SectionConversion {
  const byLabel = claimByLabel(ctx.claims);
  const sections: ResumeSection[] = [];
  const placements: { sectionId: Id; placement: SectionPlacement }[] = [];
  const droppedSections: DroppedSection[] = [];
  output.sections.forEach((draft, index) => {
    const converted = convertSection(draft, ctx, byLabel);
    if (typeof converted === 'string') {
      droppedSections.push({ index, reason: converted });
      return;
    }
    sections.push(converted.section);
    placements.push({ sectionId: converted.section.id, placement: converted.placement });
  });
  if (sections.length === 0) return { ok: false, error: '沒有任何段落通過事實項檢查' };

  const version = ResumeVersion.safeParse({
    id: ctx.newId(),
    jobSnapshotId: ctx.jobSnapshotId,
    sections,
    createdAt: ctx.createdAt,
  });
  if (!version.success) return { ok: false, error: '履歷版本不符格式' };
  const { matches, dropped } = convertMatches(output, byLabel);
  const gaps: InformationGap[] = output.gaps.map((g) => ({ ...g }));
  return {
    ok: true,
    result: {
      resumeVersion: version.data,
      placements,
      matches,
      gaps,
      droppedSections,
      droppedMatches: dropped,
    },
  };
}
