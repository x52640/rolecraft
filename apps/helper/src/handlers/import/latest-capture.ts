import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.latest_capture（D28）：最近一次網頁擷取；沒有回 null。查詢不觸發 AI 整理。 */
export const importLatestCapture: OpHandler<'import.latest_capture'> = (_payload, services) => {
  const service = services.resumeImport;
  if (!service?.latestCapture) return Promise.resolve(notImplemented());
  return Promise.resolve({ ok: true, capture: service.latestCapture() });
};
