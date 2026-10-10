import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.pick_pdf：開系統檔案選取器選 PDF 並解析。由 P1-T020 實作；接上前回 not_implemented，不偽造成功。 */
export const importPickPdf: OpHandler<'import.pick_pdf'> = () => Promise.resolve(notImplemented());
