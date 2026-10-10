import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.get_version：取得匯出版本；服務未接上回 not_implemented。 */
export const exportGetVersion: OpHandler<'export.get_version'> = (payload, services) =>
  services.pdfExport?.getVersion?.(payload) ?? Promise.resolve(notImplemented());
