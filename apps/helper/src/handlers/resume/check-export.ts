import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { resumeFailure } from './failure.ts';

/** resume.check_export：R1 匯出前檢查＋段落阻擋（未接受、退回、缺歸屬）。 */
export const resumeCheckExport: OpHandler<'resume.check_export'> = async (payload, services) => {
  if (!services.resume?.checkExport) return notImplemented();
  const result = await services.resume.checkExport(payload.resumeVersionId);
  return result ?? resumeFailure('version_not_found');
};
