import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** resume.reject_section：退回修改稿；退回的段落要改寫後接受或刪除，否則不能匯出。 */
export const resumeRejectSection: OpHandler<'resume.reject_section'> = async (
  payload,
  services,
) => {
  if (!services.resume?.reject) return notImplemented();
  return ackOrFailure(await services.resume.reject(payload.resumeVersionId, payload.sectionId));
};
