import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** resume.delete_section：刪除整段（去掉引用的唯一方式，R1）。 */
export const resumeDeleteSection: OpHandler<'resume.delete_section'> = async (
  payload,
  services,
) => {
  if (!services.resume?.remove) return notImplemented();
  return ackOrFailure(await services.resume.remove(payload.resumeVersionId, payload.sectionId));
};
