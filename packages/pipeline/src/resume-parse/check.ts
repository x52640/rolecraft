/**
 * 逐欄照抄檢查（P1-T069，R1 不捏造）。每個欄位：
 * 1. 引用的行都必須是這次送出的行（本機已移除的聯絡資料行、不存在的行都不算）。
 * 2. 公司、職稱、日期、學歷、技能、段落標題只能引用連續的行；描述與段落內文可略過中間的行。
 * 3. 值去除空白差異、全半形統一後，必須是引用行（依原文順序接合）的子字串，且每個引用行都要用到。
 *    先對模型看到的（遮蔽後）文字檢查，佔位字換回原文後再對原文檢查一次。
 * 4. 日期只能是含數字的原文片段或「至今」類字眼。
 * 不符的欄位丟棄並記原因（不帶 AI 給的值）；整段經歷所有欄位都被丟棄時整段不收。
 */
import type {
  ImportAiDiscard,
  ImportAiDiscardReason,
  ImportAiDraft,
  ImportDraftField,
  ImportStructuredExperience,
} from '@rolecraft/contracts';

import { unredact } from './personal.ts';
import { normalizeForMatch } from './text.ts';
import type { RawField, ResumeParseOutput, SentLine } from './types.ts';

type Kind = 'single' | 'joined' | 'date';

const CURRENT = /^(?:至今|迄今|仍在職|在職中|現職|現在|目前|present|now|current|today)$/iu;
const HAS_DIGIT = /\d/u;

export interface CheckContext {
  readonly lines: readonly SentLine[];
  readonly tokens: ReadonlyMap<string, string>;
}

type Verified =
  | { readonly ok: true; readonly field: ImportDraftField }
  | { readonly ok: false; readonly reason: ImportAiDiscardReason };

/** value 是否為 parts 依序接合後的子字串，且頭落在第一段、尾落在最後一段（每段都用到）。 */
export function coversLines(value: string, parts: readonly string[]): boolean {
  const target = normalizeForMatch(value);
  const norm = parts.map(normalizeForMatch);
  const joined = norm.join('');
  if (target === '' || norm.some((p) => p === '')) return false;
  const firstEnd = norm[0]?.length ?? 0;
  const lastStart = joined.length - (norm[norm.length - 1]?.length ?? 0);
  for (let at = joined.indexOf(target); at !== -1; at = joined.indexOf(target, at + 1)) {
    if (at < firstEnd && at + target.length > lastStart) return true;
  }
  return false;
}

function verify(raw: RawField, kind: Kind, ctx: CheckContext): Verified {
  if (normalizeForMatch(raw.value) === '') return { ok: false, reason: 'empty' };
  const byId = new Map(ctx.lines.map((line) => [line.id, line]));
  const cited: SentLine[] = [];
  for (const id of new Set(raw.lines)) {
    const line = byId.get(id);
    if (!line) return { ok: false, reason: 'unknown_line' };
    cited.push(line);
  }
  if (cited.length === 0) return { ok: false, reason: 'unknown_line' };
  cited.sort((a, b) => a.order - b.order);
  if (
    kind !== 'joined' &&
    cited.some((line, i) => i > 0 && line.order !== (cited[i - 1]?.order ?? 0) + 1)
  ) {
    return { ok: false, reason: 'lines_not_consecutive' };
  }
  if (
    !coversLines(
      raw.value,
      cited.map((l) => l.text),
    )
  )
    return { ok: false, reason: 'not_in_source' };
  const value = unredact(raw.value, ctx.tokens).trim();
  if (
    !coversLines(
      value,
      cited.map((l) => l.original),
    )
  )
    return { ok: false, reason: 'not_in_source' };
  if (kind === 'date' && !HAS_DIGIT.test(value) && !CURRENT.test(normalizeForMatch(value))) {
    return { ok: false, reason: 'not_a_date' };
  }
  const first = cited[0] as SentLine;
  return { ok: true, field: { value, pageNumber: first.pageNumber, lineIndex: first.lineIndex } };
}

/** 逐欄檢查；回傳只含通過欄位的草稿（personalInfo 由呼叫端填入本機抽出的值）。 */
export function checkResumeParse(
  output: ResumeParseOutput,
  ctx: CheckContext,
): Omit<ImportAiDraft, 'personalInfo'> {
  const discarded: ImportAiDiscard[] = [];
  const take = (raw: RawField | null, kind: Kind, label: string): ImportDraftField | null => {
    if (raw === null) return null;
    const result = verify(raw, kind, ctx);
    if (result.ok) return result.field;
    discarded.push({ field: label, reason: result.reason });
    return null;
  };
  const many = (raws: readonly RawField[], kind: Kind, label: (n: string) => string) =>
    raws
      .map((raw, i) => take(raw, kind, label(String(i + 1))))
      .filter((f): f is ImportDraftField => f !== null);

  const education = many(output.education, 'single', (n) => `第 ${n} 筆學歷`);
  const experiences: ImportStructuredExperience[] = [];
  output.experiences.forEach((raw, i) => {
    const at = `第 ${String(i + 1)} 段經歷`;
    const end = take(raw.end, 'date', `${at}結束日期`);
    const current = end !== null && CURRENT.test(normalizeForMatch(end.value));
    const experience: ImportStructuredExperience = {
      company: take(raw.company, 'single', `${at}公司`),
      title: take(raw.title, 'single', `${at}職稱`),
      startDate: take(raw.start, 'date', `${at}開始日期`),
      endDate: current ? null : end,
      current,
      description: take(raw.description, 'joined', `${at}描述`),
    };
    const { company, title, startDate, endDate, description } = experience;
    if ([company, title, startDate, endDate, description].some((f) => f !== null) || current) {
      experiences.push(experience);
    }
  });
  const seen = new Set<string>();
  const skills = many(output.skills, 'single', (n) => `第 ${n} 項技能`).filter((s) => {
    const key = normalizeForMatch(s.value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const otherSections = output.sections.flatMap((raw, i) => {
    const at = `第 ${String(i + 1)} 個其他段落`;
    const heading = take(raw.heading, 'single', `${at}標題`);
    const body = take(raw.body, 'joined', `${at}內文`);
    return heading && body ? [{ heading, body }] : [];
  });
  return { education, experiences, skills, otherSections, discarded };
}
