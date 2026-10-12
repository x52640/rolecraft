import type { ResumeVersion } from '@rolecraft/contracts';

import { useProfileVersion } from './useProfileVersion.ts';

/** 過期提示文字（resume-output「Profile 修改後的過期提示（D30 (a)）」）。 */
export const STALE_TEXT = '個人資料在此版本產生後改過';
export const STALE_HINT = '需要的話重新產生。';

/** 版本產生時的 Profile 版本號（舊版本沒有記錄視為 0）與目前版本號不同才算過期。 */
export function isStale(version: Pick<ResumeVersion, 'profileVersion'>, current: number): boolean {
  return (version.profileVersion ?? 0) !== current;
}

/**
 * 履歷版本上方的過期提示：只提示，不擋匯出、複製或任何操作。
 * version 物件換了（切換版本、重新整理、寫入後重新讀取）就重新比對。
 */
export function StaleNotice({ version }: { readonly version: ResumeVersion }) {
  const current = useProfileVersion(version);
  if (current === null || !isStale(version, current)) return null;
  return (
    <p role="note" className="resume-warning">
      {STALE_TEXT}。{STALE_HINT}
    </p>
  );
}
