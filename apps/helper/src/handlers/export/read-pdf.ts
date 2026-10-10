import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.read_pdf：分塊讀取匯出 PDF。由 P1-T040 實作；接上前回 not_implemented，不偽造成功。 */
export const exportReadPdf: OpHandler<'export.read_pdf'> = () => Promise.resolve(notImplemented());
