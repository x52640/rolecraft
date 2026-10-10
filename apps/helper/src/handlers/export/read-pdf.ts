import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.read_pdf：分塊讀取匯出 PDF（bridge.md「分塊」）；服務未接上回 not_implemented。 */
export const exportReadPdf: OpHandler<'export.read_pdf'> = (payload, services) =>
  services.pdfExport?.readPdf?.(payload) ?? Promise.resolve(notImplemented());
