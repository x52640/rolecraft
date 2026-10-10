import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.reject_section：退回修改稿。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeRejectSection: OpHandler<'resume.reject_section'> = () =>
  Promise.resolve(notImplemented());
