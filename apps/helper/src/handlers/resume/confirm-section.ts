import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** resume.confirm_section：逐段確認；時間由 helper 決定，記錄該段全文（R1）。 */
export const resumeConfirmSection: OpHandler<'resume.confirm_section'> = async (
  payload,
  services,
) => {
  if (!services.resume?.confirm) return notImplemented();
  return ackOrFailure(await services.resume.confirm(payload));
};
