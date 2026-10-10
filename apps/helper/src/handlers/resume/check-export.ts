import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.check_export：R1 匯出前檢查。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeCheckExport: OpHandler<'resume.check_export'> = () =>
  Promise.resolve(notImplemented());
