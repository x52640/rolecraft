/**
 * 履歷 AI 整理輸出的格式驗證（P1-T069）。輸出是資料：只解析成固定欄位的 JSON（可整份包一層 ```json）。
 * 多餘欄位、缺欄位、型別錯、超量、行編號格式錯，整份不合格（不採用、不自動重試）。
 * 值是否照抄原文屬於內容檢查（check.ts），不合的只丟那個欄位。
 */
import type { RawExperience, RawField, ResumeParseOutput } from './types.ts';

export const RESUME_PARSE_OUTPUT_LIMITS = {
  rawChars: 400_000,
  valueChars: 20_000,
  linesPerField: 400,
  education: 30,
  experiences: 60,
  skills: 300,
  sections: 60,
} as const;
const L = RESUME_PARSE_OUTPUT_LIMITS;

export type ResumeParseParseResult =
  | { readonly ok: true; readonly output: ResumeParseOutput }
  | { readonly ok: false; readonly error: string };

const LINE_ID = /^[1-9]\d{0,3}-[1-9]\d{0,5}$/u;

class Invalid extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Invalid(`${what} 必須是物件`);
  const actual = Object.keys(value).sort();
  if (actual.join(',') !== [...keys].sort().join(',')) throw new Invalid(`${what} 欄位不符`);
  return value;
}

function list(value: unknown, max: number, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Invalid(`${what} 必須是陣列`);
  if (value.length > max) throw new Invalid(`${what} 超過 ${String(max)} 項`);
  return value;
}

function field(value: unknown, what: string): RawField {
  const f = record(value, ['value', 'lines'], what);
  if (typeof f.value !== 'string') throw new Invalid(`${what}.value 必須是字串`);
  if (f.value.length > L.valueChars) throw new Invalid(`${what}.value 過長`);
  const lines = list(f.lines, L.linesPerField, `${what}.lines`);
  if (!lines.every((id): id is string => typeof id === 'string' && LINE_ID.test(id))) {
    throw new Invalid(`${what}.lines 有不合格的行編號`);
  }
  return { value: f.value, lines };
}

const optional = (value: unknown, what: string): RawField | null =>
  value === null ? null : field(value, what);

function experience(value: unknown): RawExperience {
  const e = record(value, ['company', 'title', 'start', 'end', 'description'], 'experience');
  return {
    company: optional(e.company, 'company'),
    title: optional(e.title, 'title'),
    start: optional(e.start, 'start'),
    end: optional(e.end, 'end'),
    description: optional(e.description, 'description'),
  };
}

function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

export function parseResumeParseOutput(raw: string): ResumeParseParseResult {
  if (raw.length > L.rawChars) return { ok: false, error: '輸出過長' };
  let json: unknown;
  try {
    json = JSON.parse(unwrapFence(raw));
  } catch {
    return { ok: false, error: '輸出不是 JSON' };
  }
  try {
    const top = record(json, ['education', 'experiences', 'skills', 'sections'], '輸出');
    const output: ResumeParseOutput = {
      education: list(top.education, L.education, 'education').map((v) => field(v, 'education')),
      experiences: list(top.experiences, L.experiences, 'experiences').map(experience),
      skills: list(top.skills, L.skills, 'skills').map((v) => field(v, 'skill')),
      sections: list(top.sections, L.sections, 'sections').map((v) => {
        const s = record(v, ['heading', 'body'], 'section');
        return { heading: field(s.heading, 'heading'), body: field(s.body, 'body') };
      }),
    };
    return { ok: true, output };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}
