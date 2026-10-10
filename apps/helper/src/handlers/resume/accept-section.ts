import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** resume.accept_section：接受修改稿（只接受措辭，不確認任何事實項，R1）。 */
export const resumeAcceptSection: OpHandler<'resume.accept_section'> = async (
  payload,
  services,
) => {
  if (!services.resume?.accept) return notImplemented();
  return ackOrFailure(await services.resume.accept(payload.resumeVersionId, payload.sectionId));
};
