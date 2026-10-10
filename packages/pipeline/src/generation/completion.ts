/**
 * 宣稱完成程度上限（R1 檢查 2、D4、D14）：段落把事實項寫成的完成程度不得高於事實項狀態。
 * - 使用者確認完成，且確認文字等於目前內容 → 最高「已完成」
 * - 使用者確認完成但確認後內容變了 → 最高「進行中」（需重新確認，與 domain 檢查一致）
 * - 文件標示完成 → 最高「進行中」（文件標示完成不等於完成）
 * - 計畫中、未知 → 最高「規劃中」
 * 只有功能與交付物有完成狀態；其他類型回 null（不得標完成程度）。
 */
import {
  CLAIM_TYPES_WITH_COMPLETION,
  type Claim,
  type StatedCompletion,
} from '@rolecraft/contracts';

const RANK: Record<StatedCompletion, number> = { planned: 1, in_progress: 2, completed: 3 };

export function completionCap(claim: Claim): StatedCompletion | null {
  if (!CLAIM_TYPES_WITH_COMPLETION.includes(claim.type)) return null;
  switch (claim.completionStatus) {
    case 'user_confirmed_done':
      return claim.basis.userConfirmation?.text === claim.text ? 'completed' : 'in_progress';
    case 'documented_done':
      return 'in_progress';
    case 'planned':
    case 'unknown':
    case undefined:
      return 'planned';
  }
}

export function exceedsCap(stated: StatedCompletion, cap: StatedCompletion): boolean {
  return RANK[stated] > RANK[cap];
}

export const COMPLETION_LABELS: Record<StatedCompletion, string> = {
  completed: '已完成',
  in_progress: '進行中',
  planned: '規劃中',
};
