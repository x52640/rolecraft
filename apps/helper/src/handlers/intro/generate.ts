import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { introFailure } from './failures.ts';

/**
 * intro.generate：使用者按下才觸發，背景產生投遞自介（D25）；立即回產生狀態。
 * 快照未確認、沒有可用事實項、沒有模型、超過預算回 invalid_request，不呼叫模型。不會送出任何東西（D7）。
 * fix＝「請 AI 修正」目前未通過的草稿（P1-T071），同樣只由使用者按下觸發。
 */
export const introGenerate: OpHandler<'intro.generate'> = async (
  { jobSnapshotId, fix },
  services,
) => {
  if (!services.intro?.generate) return notImplemented();
  const result = await services.intro.generate(jobSnapshotId, { fix: fix === true });
  return result.ok ? { ok: true, generation: result.generation } : introFailure(result.reason);
};
