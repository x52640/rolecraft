import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.save_corrections：暫存逐欄校正。由 P1-T020 實作；接上前回 not_implemented，不偽造成功。 */
export const importSaveCorrections: OpHandler<'import.save_corrections'> = () =>
  Promise.resolve(notImplemented());
