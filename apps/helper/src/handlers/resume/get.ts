import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { resumeFailure } from './failure.ts';

/** resume.get：履歷版本、段落與可對照的原文。 */
export const resumeGet: OpHandler<'resume.get'> = async (payload, services) => {
  if (!services.resume?.get) return notImplemented();
  const found = await services.resume.get(payload.resumeVersionId);
  return found ?? resumeFailure('version_not_found');
};
