import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { unknownRoot } from './failures.ts';

/** sources.remove_folder：移除資料夾；其下文件撤銷授權、立即停止讀取（R4）。 */
export const sourcesRemoveFolder: OpHandler<'sources.remove_folder'> = (payload, services) => {
  const service = services.sources;
  if (!service?.removeFolder) return Promise.resolve(notImplemented());
  return Promise.resolve(service.removeFolder(payload.rootId) ? { ok: true } : unknownRoot());
};
