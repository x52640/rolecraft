import type {
  ClaimCitation,
  ResumeSection,
  SectionDecision,
  StatedCompletion,
} from '@rolecraft/contracts';

/** 段落寫成的完成程度（R1）。 */
export const STATED_LABELS: Record<StatedCompletion, string> = {
  completed: '已完成',
  in_progress: '進行中',
  planned: '規劃中',
};

export const DECISION_LABELS: Record<SectionDecision, string> = {
  pending: '待你決定',
  accepted: '已接受措辭（事實項仍需各自確認）',
  rejected: '已退回',
};

export function placementLabel(section: ResumeSection): string {
  const p = section.placement;
  if (p === undefined) return '未指定位置（不能匯出）';
  if (p.group === 'summary') return '自我介紹';
  if (p.group === 'project') return '專案';
  return `工作經歷：${p.company}｜${p.title}（${p.startDate} 起）`;
}

const RANK: Record<StatedCompletion, number> = { completed: 3, in_progress: 2, planned: 1 };
const rankOf = (c: ClaimCitation | undefined) =>
  c?.statedCompletion === undefined ? 0 : RANK[c.statedCompletion];

/**
 * 既有引用中宣稱完成程度被調低（例如已完成→進行中，或拿掉標示）的事實項 ID。
 * 調低後原本的措辭可能仍寫成「已完成」，所以要強制使用者重看該段（helper 也會擋）。
 */
export function downgradedClaimIds(
  before: readonly ClaimCitation[],
  after: readonly ClaimCitation[],
): string[] {
  const next = new Map(after.map((c) => [c.claimId, c]));
  return before
    .filter((c) => c.statedCompletion !== undefined && rankOf(next.get(c.claimId)) < rankOf(c))
    .map((c) => c.claimId);
}
