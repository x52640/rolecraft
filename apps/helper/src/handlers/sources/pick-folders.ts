import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { pickerBusy } from './failures.ts';

/** sources.pick_folders：helper 開系統資料夾選取器（ADR-0003）；回不透明 ID 與名稱，不回路徑。 */
export const sourcesPickFolders: OpHandler<'sources.pick_folders'> = async (_payload, services) => {
  const service = services.sources;
  if (!service?.pickFolders) return notImplemented();
  const result = await service.pickFolders();
  if (result.status === 'busy') return pickerBusy();
  if (result.status === 'cancelled') return { ok: true, selection: { status: 'cancelled' } };
  return { ok: true, selection: { status: 'selected', roots: result.roots } };
};
