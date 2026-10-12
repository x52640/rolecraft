import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { introFailure } from './failures.ts';

/** intro.update：儲存使用者編輯並重跑檢查；draft＝儲存未通過草稿（P1-T071）。只存檔，沒有任何送出（D7）。 */
export const introUpdate: OpHandler<'intro.update'> = async (
  { jobSnapshotId, text, draft },
  services,
) => {
  if (!services.intro?.update) return notImplemented();
  const result = await services.intro.update(jobSnapshotId, text, { draft: draft === true });
  return result.ok
    ? { ok: true, intro: result.intro, check: result.check }
    : introFailure(result.reason);
};
