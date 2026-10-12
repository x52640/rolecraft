import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/**
 * photo.pick（D28）：helper 開系統選取器（只限 JPEG／PNG）；請求不帶路徑（R7）。
 * 檔案不能用、處理失敗或逾時回失敗（沒有寫入）；編輯器失敗後一律重讀 photo.get（W19）。
 */
export const photoPick: OpHandler<'photo.pick'> = async (_payload, services) => {
  const service = services.photo;
  if (!service?.pick) return notImplemented();
  const outcome = await service.pick();
  if (outcome.status === 'failed') {
    return { ok: false, error: { code: outcome.code, message: outcome.message } };
  }
  if (outcome.status !== 'selected') return { ok: true, selection: { status: outcome.status } };
  return { ok: true, selection: { status: 'selected', ...outcome.view } };
};
