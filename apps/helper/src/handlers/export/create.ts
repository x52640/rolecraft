import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.create：R1 通過才匯出 PDF 並建立不可變匯出版本（R3）；服務未接上回 not_implemented。 */
export const exportCreate: OpHandler<'export.create'> = (payload, services) =>
  services.pdfExport?.create?.(payload) ?? Promise.resolve(notImplemented());
