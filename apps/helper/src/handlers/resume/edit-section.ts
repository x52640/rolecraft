import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/**
 * resume.edit_section：自行編輯段落。引用只增不刪（R1）；宣稱完成程度被調低時，
 * 必須帶「已重看措辭」確認才寫入。
 */
export const resumeEditSection: OpHandler<'resume.edit_section'> = async (payload, services) => {
  if (!services.resume?.edit) return notImplemented();
  return ackOrFailure(await services.resume.edit(payload));
};
