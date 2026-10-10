import type { Claim, ClaimType, CompletionStatus, ReviewStatus } from '@rolecraft/contracts';

/** 事實項類型的顯示文字（R1）。 */
export const TYPE_LABELS: Record<ClaimType, string> = {
  feature: '功能',
  deliverable: '交付物',
  personal_role: '個人角色',
  outcome_metric: '成果數字',
  user_count: '使用人數',
  link: '連結',
};

/** 完成狀態四態（D4）。「文件標示完成」特別註明不等於完成（D14）。 */
export const COMPLETION_LABELS: Record<CompletionStatus, string> = {
  planned: '計畫中',
  documented_done: '文件標示完成（尚未經你確認，不等於完成）',
  user_confirmed_done: '使用者確認完成',
  unknown: '未知',
};

/** 複核狀態（R2）：正常不另外標示。 */
export const REVIEW_LABELS: Record<Exclude<ReviewStatus, 'normal'>, string> = {
  needs_review: '待複核：內容或來源已變更，請對照原文後重新確認；處理前不會用於生成',
  source_removed: '來源已移除：依據只剩你的確認',
  source_conflict: '來源矛盾：目前按「未知」處理，請對照原文後確認',
};

/** 只有功能與交付物有完成狀態，確認時要由使用者選擇（R1）。 */
export function needsCompletion(claim: Claim): boolean {
  return claim.type === 'feature' || claim.type === 'deliverable';
}

/** 使用者確認仍對應目前內容（確認後改過內容就失效，R1）。 */
export function isConfirmationCurrent(claim: Claim): boolean {
  const confirmation = claim.basis.userConfirmation;
  return confirmation !== null && confirmation.text === claim.text;
}

/**
 * 片段位置 `tb2:<起始區塊序號>:…`／`tb1:<起始區塊序號>:…` → 「第 N 段」。
 * 格式不符時不猜，回 null（只顯示文件與版本）。
 */
export function blockNumber(location: string): number | null {
  const match = /^tb[12]:(\d+):/.exec(location);
  return match?.[1] === undefined ? null : Number(match[1]) + 1;
}

/** 顯示用的時間：本機時區，精確到分。 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
