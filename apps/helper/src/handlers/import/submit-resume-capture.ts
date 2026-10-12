import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/**
 * submit_resume_capture（D28）：履歷頁擷取的區塊清單只當資料交給服務，建立網頁來源的匯入工作階段；
 * 不呼叫模型。成功只回 { ok: true }。
 */
export const submitResumeCapture: OpHandler<'submit_resume_capture'> = (payload, services) => {
  const service = services.resumeImport;
  if (!service?.submitResumeCapture) return Promise.resolve(notImplemented());
  service.submitResumeCapture(payload);
  return Promise.resolve({ ok: true });
};
