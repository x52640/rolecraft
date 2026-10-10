import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** import.get：取得解析結果。由 P1-T020 實作；接上前回 not_implemented，不偽造成功。 */
export const importGet: OpHandler<'import.get'> = () => Promise.resolve(notImplemented());
