import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.list_versions：列出匯出版本；服務未接上回 not_implemented。 */
export const exportListVersions: OpHandler<'export.list_versions'> = (_payload, services) =>
  services.pdfExport?.listVersions?.() ?? Promise.resolve(notImplemented());
