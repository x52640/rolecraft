import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.pick_pdf：helper 開系統檔案選取器（只限 PDF）並解析；請求不帶路徑（R7）。 */
export const importPickPdf: OpHandler<'import.pick_pdf'> = async (_payload, services) => {
  const service = services.resumeImport;
  if (!service?.pickPdf) return notImplemented();
  const outcome = await service.pickPdf();
  if (outcome.status === 'busy') {
    return {
      ok: false,
      error: { code: 'invalid_request', message: '已有一個選取視窗開著，請先完成或取消' },
    };
  }
  return { ok: true, selection: outcome };
};
