/**
 * 履歷 AI 整理送出前準備（P1-T069）。任何一項不成立就不送出：
 * - 本機先抽出並移除姓名與聯絡資料（personal.ts），提示裡只有遮蔽後的行。
 * - 移除後沒有任何可送的行：不送（no_text）。
 * - 提示估算超過預算不送（R8）。
 */
import { estimateTokens, fitsBudget, type InputBudget } from '@rolecraft/domain';

import { extractPersonal, type PersonalRow } from './personal.ts';
import { assembleResumeParsePrompt } from './prompt.ts';
import type { ResumeParseInputs, SentLine } from './types.ts';

export type ResumeParsePrepareFailure = 'no_text' | 'over_budget';

export interface PreparedResumeParse {
  readonly prompt: string;
  readonly estimatedTokens: number;
  /** 送出的行（遮蔽後文字＋原文），檢查輸出用同一份 */
  readonly lines: readonly SentLine[];
  /** 本機抽出的姓名與聯絡資料（從未送出） */
  readonly personalInfo: readonly PersonalRow[];
  /** 佔位字 → 原文 */
  readonly tokens: ReadonlyMap<string, string>;
}

export type PrepareResumeParseResult =
  | { readonly ok: true; readonly prepared: PreparedResumeParse }
  | { readonly ok: false; readonly reason: ResumeParsePrepareFailure };

export function prepareResumeParse(
  inputs: ResumeParseInputs,
  budget: InputBudget,
  newId: () => string,
): PrepareResumeParseResult {
  const { sent, personalInfo, tokens } = extractPersonal(inputs);
  if (sent.length === 0) return { ok: false, reason: 'no_text' };
  const prompt = assembleResumeParsePrompt(sent, newId);
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, budget)) return { ok: false, reason: 'over_budget' };
  return { ok: true, prepared: { prompt, estimatedTokens, lines: sent, personalInfo, tokens } };
}
