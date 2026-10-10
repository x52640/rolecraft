import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { unknownImport } from './failures.ts';

/** import.get：解析結果（原文與欄位草稿）；解析失敗只回原因，不當成功。 */
export const importGet: OpHandler<'import.get'> = (payload, services) => {
  const service = services.resumeImport;
  if (!service?.get) return Promise.resolve(notImplemented());
  const result = service.get(payload.importId);
  return Promise.resolve(result ? { ok: true, result } : unknownImport());
};
