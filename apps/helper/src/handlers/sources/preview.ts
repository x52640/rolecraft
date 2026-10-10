import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { folderUnreadable, unknownRoot } from './failures.ts';

/** sources.preview：重新列舉一個資料夾（只列名稱、大小、類型，不讀內容）；新候選為待確認（R4）。 */
export const sourcesPreview: OpHandler<'sources.preview'> = async (payload, services) => {
  const service = services.sources;
  if (!service?.preview) return notImplemented();
  const result = await service.preview(payload.rootId);
  if (result.status === 'unknown_root') return unknownRoot();
  if (result.status === 'unreadable') return folderUnreadable();
  return { ok: true, entries: result.entries };
};
