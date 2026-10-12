/**
 * 自介輸出的格式驗證。輸出是資料：只解析成固定欄位的 JSON（可整份包一層 ```json）。
 * 多餘欄位、缺欄位、型別錯、空白、超量、編號格式錯、完成程度不在允許值，整份不合格、不寫入。
 * 字數上限（300 字）屬於內容檢查（check.ts），這裡只擋明顯失控的長度。
 */
import { StatedCompletion } from '@rolecraft/contracts';

import type { CitationDraft } from '../generation/types.ts';
import type { IntroOutput } from './types.ts';

export const INTRO_OUTPUT_LIMITS = {
  rawChars: 20_000,
  introChars: 2_000,
  citations: 20,
} as const;

export type IntroParseResult =
  | { readonly ok: true; readonly output: IntroOutput }
  | { readonly ok: false; readonly error: string };

const CLAIM_LABEL = /^C[1-9]\d{0,3}$/u;
const HAS_CONTENT = /\S/u;
const L = INTRO_OUTPUT_LIMITS;

const failed = (error: string): IntroParseResult => ({ ok: false, error });

function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCitation(value: unknown): CitationDraft | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== 'claim' && key !== 'statedCompletion')) return null;
  const { claim } = value;
  if (typeof claim !== 'string' || !CLAIM_LABEL.test(claim)) return null;
  if (!('statedCompletion' in value)) return { claim };
  const stated = StatedCompletion.safeParse(value.statedCompletion);
  return stated.success ? { claim, statedCompletion: stated.data } : null;
}

export function parseIntroOutput(raw: string): IntroParseResult {
  if (raw.length > L.rawChars) return failed('輸出過長');
  let json: unknown;
  try {
    json = JSON.parse(unwrapFence(raw));
  } catch {
    return failed('輸出不是 JSON');
  }
  if (!isRecord(json)) return failed('輸出必須是物件');
  const extra = Object.keys(json).find((key) => key !== 'intro' && key !== 'citations');
  if (extra !== undefined) return failed(`輸出有不允許的欄位 ${extra}`);
  const { intro, citations } = json;
  if (typeof intro !== 'string') return failed('intro 必須是字串');
  if (!HAS_CONTENT.test(intro)) return failed('intro 不可為空');
  if (intro.length > L.introChars) return failed(`intro 超過 ${String(L.introChars)} 字元`);
  if (!Array.isArray(citations)) return failed('citations 必須是陣列');
  if (citations.length > L.citations) return failed(`citations 超過 ${String(L.citations)} 項`);
  const parsed: CitationDraft[] = [];
  for (const item of citations) {
    const citation = parseCitation(item);
    if (!citation) return failed('citations 有不合格的項目');
    parsed.push(citation);
  }
  return { ok: true, output: { intro, citations: parsed } };
}
