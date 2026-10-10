/**
 * 模型輸出的格式驗證。輸出是資料：只解析成固定欄位的 JSON，不會被當成指令或路徑使用。
 * 任何一處不符（多餘欄位、缺欄位、型別錯、超量、模型自稱「使用者確認完成」）整份視為不合格，
 * 呼叫端把該單元當失敗處理，不寫入任何部分（R9）。
 */
import { CLAIM_TYPES_WITH_COMPLETION, ClaimType } from '@rolecraft/contracts';

import { MODEL_COMPLETION_STATUSES } from '../prompts/analysis-prompt.ts';
import type { AnalysisOutput, ClaimDraft, ConflictDraft } from './types.ts';

export const OUTPUT_LIMITS = {
  /** 整份輸出字元上限 */
  rawChars: 200_000,
  claims: 200,
  claimText: 500,
  excerpt: 2_000,
  conflicts: 50,
  conflictSummary: 500,
  summary: 2_000,
} as const;

export type ParseResult =
  | { readonly ok: true; readonly output: AnalysisOutput }
  | { readonly ok: false; readonly error: string };

class OutputError extends Error {}

const SEGMENT_LABEL = /^S[1-9]\d{0,3}$/u;
const HAS_CONTENT = /\S/u;

function fail(message: string): never {
  throw new OutputError(message);
}

function record(value: unknown, where: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${where} 必須是物件`);
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) fail(`${where} 有不允許的欄位 ${key}`);
  }
  return obj;
}

function text(value: unknown, where: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') fail(`${where} 必須是字串`);
  if (!allowEmpty && !HAS_CONTENT.test(value)) fail(`${where} 不可為空`);
  if (value.length > max) fail(`${where} 超過 ${String(max)} 字元`);
  return value;
}

function list(value: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${where} 必須是陣列`);
  if (value.length > max) fail(`${where} 超過 ${String(max)} 項`);
  return value;
}

function parseClaim(value: unknown, i: number): ClaimDraft {
  const where = `claims[${String(i)}]`;
  const obj = record(value, where, ['segment', 'type', 'text', 'completionStatus', 'excerpt']);
  const segment = text(obj.segment, `${where}.segment`, 5);
  if (!SEGMENT_LABEL.test(segment)) fail(`${where}.segment 格式不符`);
  const type = ClaimType.safeParse(obj.type);
  if (!type.success) fail(`${where}.type 不是允許的類型`);
  const base = {
    segment,
    type: type.data,
    text: text(obj.text, `${where}.text`, OUTPUT_LIMITS.claimText),
    excerpt: text(obj.excerpt, `${where}.excerpt`, OUTPUT_LIMITS.excerpt),
  };
  const needsCompletion = CLAIM_TYPES_WITH_COMPLETION.includes(type.data);
  if (!needsCompletion) {
    if ('completionStatus' in obj) fail(`${where} 只有功能與交付物有完成狀態`);
    return base;
  }
  const status = obj.completionStatus;
  // 模型不可標「使用者確認完成」（D14）：不在允許清單內即整份不合格。
  const allowed = MODEL_COMPLETION_STATUSES.find((s) => s === status);
  if (allowed === undefined) fail(`${where}.completionStatus 不是允許的完成狀態`);
  return { ...base, completionStatus: allowed };
}

function parseConflict(value: unknown, i: number, claimCount: number): ConflictDraft {
  const where = `conflicts[${String(i)}]`;
  const obj = record(value, where, ['claims', 'summary']);
  const indices = list(obj.claims, `${where}.claims`, OUTPUT_LIMITS.claims);
  if (indices.length < 2) fail(`${where}.claims 至少要兩項`);
  const claims = indices.map((index) => {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= claimCount) {
      fail(`${where}.claims 索引不合法`);
    }
    return index;
  });
  if (new Set(claims).size !== claims.length) fail(`${where}.claims 索引重複`);
  return { claims, summary: text(obj.summary, `${where}.summary`, OUTPUT_LIMITS.conflictSummary) };
}

/** 去掉整份包住的 Markdown code fence（```json … ```）；其他前後文字一律不接受。 */
function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** 解析並驗證模型輸出。 */
export function parseAnalysisOutput(raw: string): ParseResult {
  try {
    if (raw.length > OUTPUT_LIMITS.rawChars) fail('輸出過長');
    let json: unknown;
    try {
      json = JSON.parse(unwrapFence(raw));
    } catch {
      fail('輸出不是 JSON');
    }
    const obj = record(json, '輸出', ['claims', 'conflicts', 'summary']);
    const claims = list(obj.claims, 'claims', OUTPUT_LIMITS.claims).map(parseClaim);
    const conflicts =
      obj.conflicts === undefined
        ? []
        : list(obj.conflicts, 'conflicts', OUTPUT_LIMITS.conflicts).map((c, i) =>
            parseConflict(c, i, claims.length),
          );
    const summary = text(obj.summary, 'summary', OUTPUT_LIMITS.summary, true);
    return { ok: true, output: { claims, conflicts, summary } };
  } catch (error) {
    if (error instanceof OutputError) return { ok: false, error: error.message };
    throw error;
  }
}
