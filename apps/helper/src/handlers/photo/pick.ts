import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** photo.pick（D28）：helper 開系統選取器（只限 JPEG／PNG）；請求不帶路徑（R7）。 */
export const photoPick: OpHandler<'photo.pick'> = async (_payload, services) => {
  const service = services.photo;
  if (!service?.pick) return notImplemented();
  const outcome = await service.pick();
  if (outcome.status !== 'selected') return { ok: true, selection: { status: outcome.status } };
  return { ok: true, selection: { status: 'selected', ...outcome.view } };
};
