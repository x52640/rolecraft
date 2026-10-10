import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.confirm：確認事實項；確認時間由服務決定，記錄確認當下的文字（R1、D14）。 */
export const claimsConfirm: OpHandler<'claims.confirm'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.confirm(payload));
};
