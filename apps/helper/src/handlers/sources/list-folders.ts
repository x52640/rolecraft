import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.list_folders：已加入的資料夾與待確認／已授權數量。 */
export const sourcesListFolders: OpHandler<'sources.list_folders'> = (_payload, services) => {
  const service = services.sources;
  if (!service?.listFolders) return Promise.resolve(notImplemented());
  return Promise.resolve({ ok: true, roots: service.listFolders() });
};
