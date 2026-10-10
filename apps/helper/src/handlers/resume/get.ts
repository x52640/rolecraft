import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.get：取得履歷版本與段落。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeGet: OpHandler<'resume.get'> = () => Promise.resolve(notImplemented());
