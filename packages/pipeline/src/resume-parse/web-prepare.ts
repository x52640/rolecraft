/**
 * 網頁來源 AI 整理的送出前準備（D28；resume-import「網頁來源的 AI 整理」）。任何一項不成立就不送出：
 * - 送出條件：本次頁面的姓名辨識出來（姓名元素文字，或姓名標籤的區塊值），或使用者在匯入頁確認了姓名；
 *   只有舊 Profile 的姓名不算（name_unconfirmed）。
 * - 本機先移除姓名與聯絡資料（web-personal.ts），其餘區塊遮蔽已知姓名（四個來源＋別名）、移除的值、
 *   既有 Profile 的聯絡資料值（多行的各行與接合值）與 email／電話／身分證字號（redact.ts）。標籤也遮蔽。
 * - 移除後沒有區塊：no_text；提示估算超過預算：over_budget（R8）。
 */
import { estimateTokens, fitsBudget, type InputBudget } from '@rolecraft/domain';

import { isNameLabel } from './labels.ts';
import { createRedactor } from './redact.ts';
import { normalizeForMatch } from './text.ts';
import type { WebResumeParseInputs, WebSentLine } from './types.ts';
import { knownNames } from './web-names.ts';
import { splitWebBlocks, type WebPersonalRow } from './web-personal.ts';
import { assembleWebResumeParsePrompt } from './web-prompt.ts';

export type WebResumeParsePrepareFailure = 'name_unconfirmed' | 'no_text' | 'over_budget';

export interface PreparedWebResumeParse {
  readonly prompt: string;
  readonly estimatedTokens: number;
  /** 送出的區塊（遮蔽後文字＋原文），檢查輸出用同一份 */
  readonly lines: readonly WebSentLine[];
  /** 本機抽出的姓名與聯絡資料（從未送出） */
  readonly personalInfo: readonly WebPersonalRow[];
  /** 佔位字 → 原文 */
  readonly tokens: ReadonlyMap<string, string>;
}

export type PrepareWebResumeParseResult =
  | { readonly ok: true; readonly prepared: PreparedWebResumeParse }
  | { readonly ok: false; readonly reason: WebResumeParsePrepareFailure };

const filled = (values: readonly string[]) => values.map((v) => v.trim()).filter((v) => v !== '');

/** 多行的既有聯絡值（地址）：各行、整段接起來（不加分隔與加空白）都加入遮蔽（審查 5）。 */
function lineVariants(value: string): string[] {
  const lines = filled(value.split(/\r?\n/u));
  return lines.length > 1 ? [...lines, lines.join(''), lines.join(' ')] : lines;
}

export function prepareWebResumeParse(
  inputs: WebResumeParseInputs,
  budget: InputBudget,
  newId: () => string,
): PrepareWebResumeParseResult {
  const split = splitWebBlocks(inputs.blocks);
  const pageNames = filled(inputs.pageNames);
  const confirmed = filled(inputs.confirmedNames);
  // 只有 2 字以上的姓名遮得到（redact.ts），單字姓名不算辨識或確認（複審 1）
  const maskable = (names: readonly string[]) =>
    names.some((n) => [...normalizeForMatch(n)].length >= 2);
  const recognized = maskable(pageNames) || split.labeledNames.length > 0;
  if (!recognized && !maskable(confirmed)) return { ok: false, reason: 'name_unconfirmed' };

  const names = knownNames(
    [...split.labeledNames, ...pageNames, ...confirmed, ...filled(inputs.profileNames)],
    inputs.blocks.flatMap((b) => (b.label === null ? [b.text] : [b.label, b.text])),
  );
  const { redact, tokens } = createRedactor([
    ...names.map((value) => ({ value, name: true })),
    ...split.removed,
    ...inputs.profileContacts.flatMap(lineVariants).map((value) => ({ value, name: false })),
  ]);
  const lines = split.kept.map((block, order): WebSentLine => ({
    id: block.id,
    order,
    position: Number(block.id.slice(1)),
    kind: block.kind,
    level: block.level,
    label: block.label === null ? null : redact(block.label),
    text: redact(block.text),
    original: block.text,
  }));
  if (lines.length === 0) return { ok: false, reason: 'no_text' };
  const personalInfo = withPageName(split.rows, pageNames[0], split.kept);
  const prompt = assembleWebResumeParsePrompt(lines, newId);
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, budget)) return { ok: false, reason: 'over_budget' };
  return { ok: true, prepared: { prompt, estimatedTokens, lines, personalInfo, tokens } };
}

/**
 * 區塊裡沒有姓名標籤時，用姓名元素文字預填「姓名」；出處是第一個含這個姓名的區塊
 * （找不到就不預填，不編造出處；姓名由呼叫端另外預填）。
 */
function withPageName(
  rows: readonly WebPersonalRow[],
  pageName: string | undefined,
  kept: WebResumeParseInputs['blocks'],
): readonly WebPersonalRow[] {
  if (pageName === undefined) return rows;
  const key = normalizeForMatch(pageName);
  // 已有含這個姓名的姓名列（「姓名：林雨晴」）就不重複；只有「英文姓名：Ivy」時仍預填中文姓名
  const named = (r: WebPersonalRow) =>
    isNameLabel(r.label) && normalizeForMatch(r.value.value).includes(key);
  if (rows.some(named)) return rows;
  const block = kept.find((b) => normalizeForMatch(b.text).includes(key));
  if (!block) return rows;
  const value = { value: pageName, blockId: block.id, containsPersonalData: false };
  return [{ label: '姓名', value }, ...rows];
}
