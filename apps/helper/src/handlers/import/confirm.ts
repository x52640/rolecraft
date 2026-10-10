import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.confirm：確認校正結果並寫入 Profile。由 P1-T020 實作；接上前回 not_implemented，不偽造成功。 */
export const importConfirm: OpHandler<'import.confirm'> = () => Promise.resolve(notImplemented());
