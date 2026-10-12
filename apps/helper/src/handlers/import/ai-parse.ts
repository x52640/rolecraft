import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { aiParseRefused } from './failures.ts';

/**
 * import.ai_parse：用使用者選定的 Claude 模型在背景整理已解析的文字（P1-T069），立即回狀態。
 * 姓名與聯絡資料在本機抽出、不送模型；沒有選定且可用的模型、超過預算等回 invalid_request，不呼叫模型。
 * 網頁來源（P1-T080）：names 是使用者確認的姓名，只用於本機遮蔽；姓名沒辨識出來回固定原因 name_required。
 */
export const importAiParse: OpHandler<'import.ai_parse'> = async (
  { importId, names },
  services,
) => {
  const service = services.resumeImport;
  if (!service?.aiParse) return notImplemented();
  const outcome = await service.aiParse(importId, names ?? []);
  return outcome.ok ? { ok: true, parse: outcome.parse } : aiParseRefused(outcome.reason);
};
