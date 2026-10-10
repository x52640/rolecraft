import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.accept_section：接受修改稿（只接受措辭）。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeAcceptSection: OpHandler<'resume.accept_section'> = () =>
  Promise.resolve(notImplemented());
