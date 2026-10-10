/**
 * 生成輸出的格式驗證。輸出是資料：只解析成固定欄位的 JSON。任何一處不符（多餘欄位、缺欄位、
 * 型別錯、超量、編號格式錯、完成程度不在允許值）整份不合格，呼叫端當單元失敗處理、不寫入任何部分。
 * 編號是否對得上實際事實項／經歷，在 sections.ts 逐段判定。
 */
import { SECTION_RATIONALE_MAX_CHARS, StatedCompletion } from '@rolecraft/contracts';

import type {
  CitationDraft,
  GapDraft,
  GenerationOutput,
  MatchDraft,
  PlacementDraft,
  SectionDraft,
} from './types.ts';

export const GENERATION_OUTPUT_LIMITS = {
  rawChars: 200_000,
  sections: 40,
  sectionText: 2_000,
  citations: 20,
  rationale: SECTION_RATIONALE_MAX_CHARS,
  matches: 50,
  gaps: 50,
  requirement: 300,
  question: 300,
} as const;

export type GenerationParseResult =
  | { readonly ok: true; readonly output: GenerationOutput }
  | { readonly ok: false; readonly error: string };

class OutputError extends Error {}

const CLAIM_LABEL = /^C[1-9]\d{0,3}$/u;
const EXPERIENCE_LABEL = /^E[1-9]\d{0,2}$/u;
const HAS_CONTENT = /\S/u;
const L = GENERATION_OUTPUT_LIMITS;

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

function text(value: unknown, where: string, max: number): string {
  if (typeof value !== 'string') fail(`${where} 必須是字串`);
  if (!HAS_CONTENT.test(value)) fail(`${where} 不可為空`);
  if (value.length > max) fail(`${where} 超過 ${String(max)} 字元`);
  return value;
}

function list(value: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${where} 必須是陣列`);
  if (value.length > max) fail(`${where} 超過 ${String(max)} 項`);
  return value;
}

function claimLabelOf(value: unknown, where: string): string {
  if (typeof value !== 'string' || !CLAIM_LABEL.test(value)) fail(`${where} 不是事實項編號`);
  return value;
}

function parsePlacement(value: unknown, where: string): PlacementDraft {
  if (value === 'summary' || value === 'project') return value;
  if (typeof value === 'string' && EXPERIENCE_LABEL.test(value)) return value as PlacementDraft;
  return fail(`${where} 不是允許的位置`);
}

function parseCitation(value: unknown, where: string): CitationDraft {
  const obj = record(value, where, ['claim', 'statedCompletion']);
  const claim = claimLabelOf(obj.claim, `${where}.claim`);
  if (!('statedCompletion' in obj)) return { claim };
  const stated = StatedCompletion.safeParse(obj.statedCompletion);
  if (!stated.success) fail(`${where}.statedCompletion 不是允許的完成程度`);
  return { claim, statedCompletion: stated.data };
}

function parseSection(value: unknown, i: number): SectionDraft {
  const where = `sections[${String(i)}]`;
  const obj = record(value, where, ['placement', 'text', 'citations', 'rationale']);
  return {
    placement: parsePlacement(obj.placement, `${where}.placement`),
    text: text(obj.text, `${where}.text`, L.sectionText),
    citations: list(obj.citations, `${where}.citations`, L.citations).map((c, j) =>
      parseCitation(c, `${where}.citations[${String(j)}]`),
    ),
    rationale: text(obj.rationale, `${where}.rationale`, L.rationale),
  };
}

function parseMatch(value: unknown, i: number): MatchDraft {
  const where = `matches[${String(i)}]`;
  const obj = record(value, where, ['requirement', 'claims']);
  return {
    requirement: text(obj.requirement, `${where}.requirement`, L.requirement),
    claims: list(obj.claims, `${where}.claims`, L.citations).map((c, j) =>
      claimLabelOf(c, `${where}.claims[${String(j)}]`),
    ),
  };
}

function parseGap(value: unknown, i: number): GapDraft {
  const where = `gaps[${String(i)}]`;
  const obj = record(value, where, ['requirement', 'question']);
  return {
    requirement: text(obj.requirement, `${where}.requirement`, L.requirement),
    question: text(obj.question, `${where}.question`, L.question),
  };
}

/** 去掉整份包住的 Markdown code fence（```json … ```）；其他前後文字一律不接受。 */
function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** 解析並驗證生成輸出。 */
export function parseGenerationOutput(raw: string): GenerationParseResult {
  try {
    if (raw.length > L.rawChars) fail('輸出過長');
    let json: unknown;
    try {
      json = JSON.parse(unwrapFence(raw));
    } catch {
      fail('輸出不是 JSON');
    }
    const obj = record(json, '輸出', ['matches', 'gaps', 'sections']);
    return {
      ok: true,
      output: {
        matches: list(obj.matches, 'matches', L.matches).map(parseMatch),
        gaps: list(obj.gaps, 'gaps', L.gaps).map(parseGap),
        sections: list(obj.sections, 'sections', L.sections).map(parseSection),
      },
    };
  } catch (error) {
    if (error instanceof OutputError) return { ok: false, error: error.message };
    throw error;
  }
}
