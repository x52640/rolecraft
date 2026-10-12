/**
 * 逐欄照抄檢查（P1-T069，R1 不捏造）。每個欄位：
 * 1. 引用的行都必須是這次送出的行（本機已移除的聯絡資料行、不存在的行都不算）。
 * 2. 公司、職稱、日期、學歷、技能、段落標題只能引用連續的行，值是引用行接合後的子字串（英數要合詞界）；
 *    描述與段落內文以行為單位，每段等於一行或連續幾行引用行的全文（match.ts）。
 * 3. 先對模型看到的（遮蔽後）文字檢查，佔位字換回原文後再對原文檢查一次。
 * 4. 日期必須是年份或年月格式；結束日期是「至今」類字眼時，要緊接在區間分隔符後或獨占一欄，
 *    且引用行含數字年份。
 * 不符的欄位丟棄並記原因（不帶 AI 給的值）；整段經歷所有欄位都被丟棄時整段不收。
 */
import type {
  ImportAiDiscard,
  ImportAiDiscardReason,
  ImportAiDraft,
  ImportDraftField,
  ImportStructuredExperience,
} from '@rolecraft/contracts';

import {
  CURRENT,
  coversLines,
  coversWholeLines,
  currentWordGrounded,
  isDateValue,
} from './match.ts';
import { unredact } from './redact.ts';
import { normalizeForMatch } from './text.ts';
import type { RawField, ResumeParseOutput, SentLine } from './types.ts';

export { coversLines, coversWholeLines } from './match.ts';

/** single：一般欄位；joined：描述與段落內文；start／end：開始與結束日期 */
type Kind = 'single' | 'joined' | 'start' | 'end';

export interface CheckContext {
  readonly lines: readonly SentLine[];
  readonly tokens: ReadonlyMap<string, string>;
}

type Verified =
  | { readonly ok: true; readonly field: ImportDraftField }
  | { readonly ok: false; readonly reason: ImportAiDiscardReason };

function citedLines(raw: RawField, kind: Kind, ctx: CheckContext) {
  const byId = new Map(ctx.lines.map((line) => [line.id, line]));
  const cited: SentLine[] = [];
  for (const id of new Set(raw.lines)) {
    const line = byId.get(id);
    if (!line) return 'unknown_line' as const;
    cited.push(line);
  }
  if (cited.length === 0) return 'unknown_line' as const;
  cited.sort((a, b) => a.order - b.order);
  const gap = cited.some((line, i) => i > 0 && line.order !== (cited[i - 1]?.order ?? 0) + 1);
  return kind !== 'joined' && gap ? ('lines_not_consecutive' as const) : cited;
}

function verify(raw: RawField, kind: Kind, ctx: CheckContext): Verified {
  if (normalizeForMatch(raw.value) === '') return { ok: false, reason: 'empty' };
  const cited = citedLines(raw, kind, ctx);
  if (typeof cited === 'string') return { ok: false, reason: cited };
  const covers = kind === 'joined' ? coversWholeLines : coversLines;
  const value = unredact(raw.value, ctx.tokens).trim();
  const sentTexts = cited.map((l) => l.text);
  const originals = cited.map((l) => l.original);
  if (!covers(raw.value, sentTexts) || !covers(value, originals)) {
    return { ok: false, reason: 'not_in_source' };
  }
  if (kind === 'start' || kind === 'end') {
    const current = kind === 'end' && CURRENT.test(normalizeForMatch(value));
    if (current ? !currentWordGrounded(value, originals) : !isDateValue(value)) {
      return { ok: false, reason: 'not_a_date' };
    }
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
    const end = take(raw.end, 'end', `${at}結束日期`);
    const current = end !== null && CURRENT.test(normalizeForMatch(end.value));
    const experience: ImportStructuredExperience = {
      company: take(raw.company, 'single', `${at}公司`),
      title: take(raw.title, 'single', `${at}職稱`),
      startDate: take(raw.start, 'start', `${at}開始日期`),
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
