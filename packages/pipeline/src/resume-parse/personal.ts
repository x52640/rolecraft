/**
 * 姓名與聯絡資料只在本機處理（P1-T069，協調者保守選擇）：送給模型前先抽出並移除。
 * - 個資標籤行（labels.ts：「標籤：值」「標籤⇥值」、無冒號的「LINE ID xxx」）整行移除，值由本機預填；
 *   標籤獨占一行（含雙欄「姓名⇥電話」）時下一行是值，一併移除。
 * - 104 已知的完整值（本機規則把換行續行接回）依序比對消耗，續行不論幾行都移除。
 * - 「聯絡方式」「Contact」等標題下到下一個段落標題前（最多 8 行）整段移除。
 * - 其餘行由 redact.ts 遮蔽姓名（含抽到的姓名列、頁首英文名）、已抽出的個資值與 email／電話／身分證字號。
 */
import type { ImportDraftField } from '@rolecraft/contracts';

import { isNameLabel, isStrictPersonalLabel, labelOnlyLine, personalLabelLine } from './labels.ts';
import { createRedactor, type Secret } from './redact.ts';
import { headingKey, isSectionHeading, normalizeForMatch } from './text.ts';
import type { ResumeParseInputs, SentLine } from './types.ts';

export { isPersonalLabel } from './labels.ts';
export { unredact } from './redact.ts';

export const CONTACT_HEADINGS = new Set([
  '聯絡方式',
  '聯絡資訊',
  '聯絡資料',
  '個人資料',
  '基本資料',
  'contact',
  'contactinformation',
  'contactinfo',
  'contactdetails',
  'personalinformation',
  'personaldetails',
  'personalinfo',
]);
export const CONTACT_BLOCK_MAX = 8;

export interface PersonalRow {
  readonly label: string;
  readonly value: ImportDraftField;
}

export interface PersonalExtraction {
  readonly sent: readonly SentLine[];
  readonly personalInfo: readonly PersonalRow[];
  /** 佔位字 → 原文 */
  readonly tokens: ReadonlyMap<string, string>;
}

interface Kept {
  position: number;
  pageNumber: number;
  lineIndex: number;
  original: string;
}

type Row = { label: string; value: ImportDraftField };

/** 第一遍：分出要移除的個資行（記成 rows）與要送出的行。 */
function split(inputs: ResumeParseInputs) {
  const rows: Row[] = [];
  const kept: Kept[] = [];
  /** 同一標籤只留第一個；append＝聯絡區塊裡沒有標籤的行，接在同一列後面 */
  const addRow = (label: string, value: string, where: [number, number], append = false) => {
    const clean = value.trim();
    if (label === '' || clean === '') return;
    const existing = rows.find((r) => r.label === label);
    if (existing && append) {
      existing.value = { ...existing.value, value: `${existing.value.value}\n${clean}` };
    }
    if (existing) return;
    rows.push({ label, value: { value: clean, pageNumber: where[0], lineIndex: where[1] } });
  };
  const first = inputs.names[0];
  if (first) addRow('姓名', first.value, [first.pageNumber, first.lineIndex]);
  /** 104 已知完整值：回傳這一行之後還沒出現的部分（正規化後） */
  const restOfHint = (label: string, value: string): { value: string; rest: string } | null => {
    const start = normalizeForMatch(value);
    const hint = inputs.personalHints.find(
      (h) => h.label === label && start !== '' && normalizeForMatch(h.value).startsWith(start),
    );
    return hint
      ? { value: hint.value, rest: normalizeForMatch(hint.value).slice(start.length) }
      : null;
  };

  let block: { label: string; remaining: number } | null = null;
  let pending: string[] | null = null;
  let rest = '';
  let position = 0;
  for (const page of inputs.pages) {
    page.lines.forEach((original, lineIndex) => {
      const where: [number, number] = [page.pageNumber, lineIndex];
      const norm = normalizeForMatch(original);
      if (norm === '') return;
      position += 1;
      const heading = isSectionHeading(original);
      // 先認「整行都是標籤」（雙欄「姓名⇥居住地」不能被當成「姓名＝居住地」）
      const labelsOnly = labelOnlyLine(original);
      const labelLine = labelsOnly ? null : personalLabelLine(original);
      if (pending && !heading && !labelLine && !labelsOnly) {
        const values = original
          .split('\t')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        if (values.length === pending.length)
          pending.forEach((l, i) => addRow(l, values[i] ?? '', where));
        else addRow(pending[0] ?? '', original, where);
        pending = null;
        return;
      }
      pending = null;
      if (rest !== '' && !heading && !labelLine && rest.startsWith(norm)) {
        rest = rest.slice(norm.length);
        return;
      }
      rest = '';
      if (block && (heading || block.remaining <= 0)) block = null;
      if (block) {
        block.remaining -= 1;
        if (labelLine) addRow(labelLine.label, labelLine.value, where);
        else addRow(block.label, original, where, true);
        return;
      }
      if (CONTACT_HEADINGS.has(headingKey(original))) {
        block = { label: original.trim().replace(/[:：]+$/u, ''), remaining: CONTACT_BLOCK_MAX };
        return;
      }
      if (labelLine) {
        if (labelLine.value === '') {
          // 值在下一行、會連下一行一起移除：標籤要嚴格辨識（「Mobile Developer：」照送，codex 審查 2）
          if (!isStrictPersonalLabel(labelLine.label)) {
            kept.push({ position, pageNumber: page.pageNumber, lineIndex, original });
            return;
          }
          pending = [labelLine.label];
          return;
        }
        const hinted = restOfHint(labelLine.label, labelLine.value);
        addRow(labelLine.label, hinted?.value ?? labelLine.value, where);
        rest = hinted?.rest ?? '';
        return;
      }
      if (labelsOnly) {
        pending = labelsOnly;
        return;
      }
      kept.push({ position, pageNumber: page.pageNumber, lineIndex, original });
    });
  }
  return { rows, kept };
}

function secretsOf(inputs: ResumeParseInputs, rows: readonly Row[]): Secret[] {
  const names = inputs.names.map((n) => ({ value: n.value, name: true }));
  const fromRows = rows.flatMap((r) =>
    r.value.value.split('\n').map((value) => ({ value, name: isNameLabel(r.label) })),
  );
  return [...names, ...fromRows];
}

export function extractPersonal(inputs: ResumeParseInputs): PersonalExtraction {
  const { rows, kept } = split(inputs);
  const { redact, tokens } = createRedactor(secretsOf(inputs, rows));
  const sent = kept.map((k, order): SentLine => ({
    id: `${String(k.pageNumber)}-${String(k.lineIndex + 1)}`,
    order,
    position: k.position,
    pageNumber: k.pageNumber,
    lineIndex: k.lineIndex,
    text: redact(k.original),
    original: k.original,
  }));
  return { sent, personalInfo: rows, tokens };
}
