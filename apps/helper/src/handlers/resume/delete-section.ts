import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.delete_section：刪除整段。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeDeleteSection: OpHandler<'resume.delete_section'> = () =>
  Promise.resolve(notImplemented());
