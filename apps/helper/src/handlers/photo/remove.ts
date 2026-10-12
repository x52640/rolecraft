import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** photo.remove（D28）：刪除目前照片，套 D19。 */
export const photoRemove: OpHandler<'photo.remove'> = async (_payload, services) => {
  const service = services.photo;
  if (!service?.remove) return notImplemented();
  await service.remove();
  return { ok: true };
};
