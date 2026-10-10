import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.edit_section：自行編輯段落（引用只增不刪）。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeEditSection: OpHandler<'resume.edit_section'> = () =>
  Promise.resolve(notImplemented());
