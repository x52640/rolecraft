import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { unknownImport } from './failures.ts';

/** import.save_corrections：暫存逐欄校正；不算確認、不寫入 Profile。 */
export const importSaveCorrections: OpHandler<'import.save_corrections'> = (payload, services) => {
  const service = services.resumeImport;
  if (!service?.saveCorrections) return Promise.resolve(notImplemented());
  const outcome = service.saveCorrections(payload.importId, payload.profile);
  return Promise.resolve(outcome.ok ? { ok: true } : unknownImport());
};
