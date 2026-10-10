import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** resume.generate：產生客製履歷（回工作 id）。由 P1-T025 實作；接上前回 not_implemented，不偽造成功。 */
export const resumeGenerate: OpHandler<'resume.generate'> = () => Promise.resolve(notImplemented());
