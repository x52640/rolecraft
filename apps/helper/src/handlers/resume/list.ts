import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.list：列出某職缺的履歷版本。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeList: OpHandler<'resume.list'> = () => Promise.resolve(notImplemented());
