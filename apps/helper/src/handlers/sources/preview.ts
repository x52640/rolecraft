import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.preview：重新列舉並預覽資料夾。由 P1-T021 實作；接上前回 not_implemented，不偽造成功。 */
export const sourcesPreview: OpHandler<'sources.preview'> = () => Promise.resolve(notImplemented());
