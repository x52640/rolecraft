import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.start_manual（D28）：建立沒有原文的匯入工作階段，供手動輸入後確認。 */
export const importStartManual: OpHandler<'import.start_manual'> = (_payload, services) => {
  const service = services.resumeImport;
  if (!service?.startManual) return Promise.resolve(notImplemented());
  return Promise.resolve({ ok: true, importId: service.startManual().importId });
};
