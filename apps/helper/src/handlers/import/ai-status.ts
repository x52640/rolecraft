import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { unknownImport } from './failures.ts';

/** import.ai_status：最近一次 AI 整理的狀態與（成功時）逐欄檢查過的草稿（P1-T069）。 */
export const importAiStatus: OpHandler<'import.ai_status'> = ({ importId }, services) => {
  const service = services.resumeImport;
  if (!service?.aiStatus) return Promise.resolve(notImplemented());
  const outcome = service.aiStatus(importId);
  return Promise.resolve(outcome.ok ? { ok: true, parse: outcome.parse } : unknownImport());
};
