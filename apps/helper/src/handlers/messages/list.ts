import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** messages.list：列出訊息與草稿。由 P1-T029 實作；接上前回 not_implemented，不偽造成功。 */
export const messagesList: OpHandler<'messages.list'> = () => Promise.resolve(notImplemented());
