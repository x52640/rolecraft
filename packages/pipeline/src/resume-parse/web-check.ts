/**
 * 網頁來源的逐欄照抄檢查（D28；resume-import「網頁來源的 AI 整理」W8）。規則同 PDF（check.ts），來源單位是區塊：
 * - 欄位出處是第一個引用區塊的編號；標籤不算來源文字（只比對區塊文字）。
 * - 「至今」類字眼獨占一個區塊時：引用只能是這個區塊；往前找日期上下文——略過只有區間分隔符的區塊，
 *   遇到的第一個區塊去掉結尾的區間分隔符後必須整個是年份或年月（isDateValue），兩者之間沒有標題區塊，
 *   也沒有本機移除的區塊（區塊編號必須連續）。上下文不列入引用。
 * - 值換回佔位字時還原出姓名或個資：標 containsPersonalData（W7）。
 */
import type { ImportWebAiDraft, ImportWebDraftField } from '@rolecraft/contracts';

import { checkFields, type CheckContext, type FieldAdapter } from './check.ts';
import { CURRENT, isDateValue } from './match.ts';
import { restoresSecret } from './redact.ts';
import { isSectionHeading, normalizeForMatch } from './text.ts';
import type { ResumeParseOutput, WebSentLine } from './types.ts';

const RANGE_ONLY = /^(?:[~〜\-–—至]|to)+$/iu;
const TRAILING_RANGE = /(?:\s*(?:[~〜\-–—至]|(?<![A-Za-z])to))+\s*$/iu;

const blockNumber = (line: WebSentLine) => Number(line.id.slice(1));
const isHeading = (line: WebSentLine) => line.kind === 'heading' || isSectionHeading(line.original);

/** 獨占區塊的「至今」往前找日期上下文。 */
export function currentFromContext(
  cited: readonly WebSentLine[],
  ctx: CheckContext<WebSentLine>,
): boolean {
  const own = cited.length === 1 ? cited[0] : undefined;
  if (!own || !CURRENT.test(normalizeForMatch(own.original))) return false;
  const ordered = [...ctx.lines].sort((a, b) => a.order - b.order);
  let at = ordered.indexOf(own);
  let next = own;
  while (at > 0) {
    at -= 1;
    const line = ordered[at] as WebSentLine;
    if (blockNumber(line) !== blockNumber(next) - 1 || isHeading(line)) return false;
    if (RANGE_ONLY.test(normalizeForMatch(line.original))) {
      next = line;
      continue;
    }
    return isDateValue(line.original.normalize('NFKC').replace(TRAILING_RANGE, ''));
  }
  return false;
}

function webAdapter(
  tokens: ReadonlyMap<string, string>,
): FieldAdapter<WebSentLine, ImportWebDraftField> {
  return {
    toField: (value, raw, cited) => ({
      value,
      blockId: (cited[0] as WebSentLine).id,
      containsPersonalData: restoresSecret(raw.value, tokens),
    }),
    currentContext: currentFromContext,
  };
}

/** 網頁來源的逐欄檢查；personalInfo 由呼叫端填入本機抽出的值。 */
export function checkWebResumeParse(
  output: ResumeParseOutput,
  ctx: CheckContext<WebSentLine>,
): Omit<ImportWebAiDraft, 'personalInfo'> {
  return checkFields(output, ctx, webAdapter(ctx.tokens));
}
