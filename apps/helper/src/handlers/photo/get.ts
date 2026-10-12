import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** photo.get（D28）：目前照片資訊＋縮圖；沒有回 null。 */
export const photoGet: OpHandler<'photo.get'> = async (_payload, services) => {
  const service = services.photo;
  if (!service?.get) return notImplemented();
  return { ok: true, current: await service.get() };
};
