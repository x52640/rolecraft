import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.confirm_section：逐段確認。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeConfirmSection: OpHandler<'resume.confirm_section'> = () =>
  Promise.resolve(notImplemented());
