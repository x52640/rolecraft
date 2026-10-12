/**
 * 網頁區塊專用的個資標籤判斷（D28；P1-T078 審查 3）。PDF 路徑不用這裡的規則。
 * - 標籤＋值區塊：位置已確定是標籤，中文標籤不受 8 字限制（isPersonalBlockLabel）；標籤沒認出時，
 *   值本身是「LINE: abc」「LINE ID abc」這類個資標籤行也整塊移除。
 * - 4 格以上（偶數格）的表格列：每一對「標籤⇥值」個別判斷，任何一對是個資就整列移除。
 * - 中英並列的聯絡標題（「聯絡方式 Contact」）也開聯絡區。
 */
import type { ImportWebBlock } from '@rolecraft/contracts';

import {
  isPersonalBlockLabel,
  isPersonalLabel,
  personalLabelLine,
  type LabelLine,
} from './labels.ts';
import { CONTACT_HEADINGS } from './personal.ts';
import { headingKey } from './text.ts';

/** 個資標籤行：標籤＋值區塊直接看標籤，認不出再看值；其他區塊照 PDF 規則。 */
export function labelOf(
  block: ImportWebBlock,
  line: string,
  labelsOnly: boolean,
): LabelLine | null {
  if (block.label !== null) {
    if (isPersonalBlockLabel(block.label)) return { label: block.label.trim(), value: block.text };
    const inner = personalLabelLine(block.text);
    return inner ? { label: inner.label, value: block.text } : null;
  }
  return labelsOnly ? null : personalLabelLine(line);
}

/** 4 格以上的偶數格表格列：回傳是個資的「標籤、值」對；沒有就回空陣列。 */
export function personalTablePairs(block: ImportWebBlock): LabelLine[] {
  if (block.kind !== 'table_row') return [];
  const cells = block.text.split('\t').map((c) => c.trim().replace(/[:：]+$/u, ''));
  if (cells.length < 4 || cells.length % 2 !== 0) return [];
  const pairs: LabelLine[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const label = cells[i] ?? '';
    if (isPersonalLabel(label)) pairs.push({ label, value: cells[i + 1] ?? '' });
  }
  return pairs;
}

/** 聯絡標題：整個標題是聯絡詞，或中文部分與英文部分各自是聯絡詞（不含數字）。 */
export function isContactHeading(text: string): boolean {
  const key = headingKey(text);
  if (CONTACT_HEADINGS.has(key)) return true;
  const bare = key.replace(/[\p{P}\p{S}]/gu, '');
  if (bare === '' || /\d/u.test(bare)) return false;
  const cjk = bare.replace(/[a-z]/gu, '');
  const ascii = bare.replace(/[^a-z]/gu, '');
  return (cjk === '' || CONTACT_HEADINGS.has(cjk)) && (ascii === '' || CONTACT_HEADINGS.has(ascii));
}
