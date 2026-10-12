/**
 * 網頁來源的姓名與聯絡資料只在本機處理（D28；resume-import「網頁來源的 AI 整理」W6）。區塊依順序當成行，
 * 套用 PDF 同一套規則（labels.ts、redact.ts），另加：
 * - 標籤＋值區塊以「標籤：值」判斷：標籤是個資標籤就整塊移除、值由本機預填。
 * - 被移除區塊後面的 `continues` 區塊是同一元素的續行：一併移除，值接回同一列（W18；不適用「同一標籤只留
 *   第一個」）；遮蔽用每一段與接回後的完整值。
 * - 聯絡區：「聯絡方式」等標題區塊下，移除到下一個同級或更高級的標題區塊為止；段落形式的聯絡標題照 PDF 規則。
 * - 同一標籤的第二個值不預填，但一律加入遮蔽。
 * - 網頁專用的標籤寫法（長中文標籤、值裡的「LINE:」、4 格表格列、中英並列聯絡標題）見 web-labels.ts。
 * - 續行（continues）不當段落邊界：「聯絡方式⏎地址」切成兩個標題區塊時，第二個不結束聯絡區（審查 4）。
 */
import type { ImportWebDraftField, ImportWebBlock } from '@rolecraft/contracts';

import { isNameLabel, isStrictPersonalLabel, labelOnlyLine } from './labels.ts';
import { CONTACT_BLOCK_MAX } from './personal.ts';
import type { Secret } from './redact.ts';
import { isSectionHeading, normalizeForMatch } from './text.ts';
import { isContactHeading, labelOf, namePart, personalTablePairs } from './web-labels.ts';

export interface WebPersonalRow {
  readonly label: string;
  readonly value: ImportWebDraftField;
}

interface Row {
  label: string;
  value: ImportWebDraftField;
}

/** 一串被移除的區塊（本身＋續行）：每段文字與它要接回的預填列。 */
interface Chain {
  readonly label: string;
  readonly row: Row | null;
  readonly name: boolean;
  readonly parts: string[];
}

export interface WebSplit {
  readonly rows: readonly WebPersonalRow[];
  readonly kept: readonly ImportWebBlock[];
  /** 移除的值（每段、接回後的完整值），全部加入遮蔽 */
  readonly removed: readonly Secret[];
  /**
   * 從區塊抽到的姓名（送出條件 (2)）：完整姓名標籤的值，以及「姓」＋「名」合併的姓名（含中間空白變體）；
   * 都至少 2 字（遮蔽只遮 2 字以上的姓名，單字不算已辨識；複審 1）。
   */
  readonly labeledNames: readonly string[];
  /**
   * 所有姓名標籤的值（含只有姓或名的部分，去重）：一律交給 knownNames 遮蔽與拆別名，
   * 與上面的確認門檻分開（複審 2-1）。
   */
  readonly nameValues: readonly string[];
  /** 姓 × 名的組合數超過上限（沒有組合、遮不全）：呼叫端一律拒絕送出（fail closed） */
  readonly nameCombinationsOverLimit: boolean;
}

type Region = { label: string; level: number | null; remaining: number };

const isHeadingBlock = (b: ImportWebBlock) => b.kind === 'heading' || isSectionHeading(b.text);

/** 區塊當成一行：標籤＋值區塊是「標籤：值」。 */
export function blockLine(block: ImportWebBlock): string {
  return block.label === null ? block.text : `${block.label}：${block.text}`;
}

export function splitWebBlocks(blocks: readonly ImportWebBlock[]): WebSplit {
  const rows: Row[] = [];
  const kept: ImportWebBlock[] = [];
  const chains: Chain[] = [];
  const remove = (
    label: string,
    value: string,
    block: ImportWebBlock,
    append = false,
  ): Chain | null => {
    const clean = value.trim();
    if (label === '' || clean === '') return null;
    const existing = rows.find((r) => r.label === label);
    let row: Row | null = null;
    if (!existing) {
      row = { label, value: { value: clean, blockId: block.id, containsPersonalData: false } };
      rows.push(row);
    } else if (append) {
      existing.value = { ...existing.value, value: `${existing.value.value}\n${clean}` };
      row = existing;
    }
    const chain: Chain = { label, row, name: isNameLabel(label), parts: [clean] };
    chains.push(chain);
    return chain;
  };

  let region: Region | null = null;
  let pending: string[] | null = null;
  let last: Chain | null = null;
  for (const block of blocks) {
    if (normalizeForMatch(block.text) === '') continue;
    // 被移除區塊的續行（同一元素因換行切開）：一併移除、接回同一列
    if (block.continues && last) {
      const part = block.text.trim();
      last.parts.push(part);
      if (last.row)
        last.row.value = { ...last.row.value, value: `${last.row.value.value}\n${part}` };
      continue;
    }
    last = null;
    const line = blockLine(block);
    const heading = isHeadingBlock(block);
    const labelsOnly = block.label === null ? labelOnlyLine(line) : null;
    const labelLine = labelOf(block, line, labelsOnly !== null);
    if (pending && !heading && !labelLine && !labelsOnly) {
      const values = line
        .split('\t')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      if (values.length === pending.length) {
        for (const [i, l] of pending.entries()) last = remove(l, values[i] ?? '', block) ?? last;
      } else last = remove(pending[0] ?? '', line, block);
      pending = null;
      continue;
    }
    pending = null;
    if (region && regionEnds(region, block)) region = null;
    if (region) {
      region.remaining -= 1;
      // 聯絡區裡獨占一塊的標籤（104「主要手機」⏎「0900…」）：下一塊是它的值，一併移除（不佔聯絡區行數）
      if (labelsOnly) {
        pending = labelsOnly;
        continue;
      }
      last = labelLine
        ? remove(labelLine.label, labelLine.value, block)
        : remove(region.label, line, block, true);
      continue;
    }
    const pairs = personalTablePairs(block);
    if (pairs.length > 0) {
      // 4 格表格列：任何一對是個資就整列移除，個資的值各自預填與遮蔽
      for (const pair of pairs) last = remove(pair.label, pair.value, block) ?? last;
      continue;
    }
    if (block.label === null && isContactHeading(block.text)) {
      const label = block.text.trim().replace(/[:：]+$/u, '');
      region = {
        label,
        level: block.kind === 'heading' ? block.level : null,
        remaining: CONTACT_BLOCK_MAX,
      };
      continue;
    }
    if (labelLine) {
      if (labelLine.value === '') {
        // 值在下一個區塊、會連它一起移除：標籤要嚴格辨識（PDF 同一規則）
        if (!isStrictPersonalLabel(labelLine.label)) {
          kept.push(block);
          continue;
        }
        pending = [labelLine.label];
        continue;
      }
      last = remove(labelLine.label, labelLine.value, block);
      continue;
    }
    if (labelsOnly) {
      pending = labelsOnly;
      continue;
    }
    kept.push(block);
  }
  const names = namesOf(chains);
  const nameValues = [...new Set(chains.filter((c) => c.name).map((c) => c.parts.join(' ')))];
  return {
    rows,
    kept,
    removed: secretsOf(chains),
    labeledNames: names.names,
    nameValues,
    nameCombinationsOverLimit: names.overLimit,
  };
}

/** 標題區塊開的聯絡區到下一個同級或更高級的標題區塊為止；段落形式的照 PDF 規則（段落標題、最多 8 行）。 */
function regionEnds(region: Region, block: ImportWebBlock): boolean {
  if (block.continues) return false;
  if (region.level !== null) {
    return block.kind === 'heading' && (block.level ?? 1) <= region.level;
  }
  return isHeadingBlock(block) || region.remaining <= 0;
}

function secretsOf(chains: readonly Chain[]): Secret[] {
  return chains.flatMap((c) => {
    const whole = c.parts.length > 1 ? [c.parts.join(''), c.parts.join(' ')] : [];
    return [...c.parts, ...whole].map((value) => ({ value, name: c.name }));
  });
}

const atLeastTwo = (value: string) => [...normalizeForMatch(value)].length >= 2;

/**
 * 姓 × 名的組合上限（去重後）。超過就不組合（避免字串爆量），組合後的姓名因此遮不到，
 * prepareWebResumeParse 一律拒絕送出（name_parts_over_limit；複審 fail closed）。
 */
export const NAME_COMBINATIONS_MAX = 16;

function namesOf(chains: readonly Chain[]): { names: string[]; overLimit: boolean } {
  const named = chains.filter((c) => c.name);
  const valuesOf = (part: ReturnType<typeof namePart>) => [
    ...new Set(named.filter((c) => namePart(c.label) === part).map((c) => c.parts.join(' '))),
  ];
  const family = valuesOf('family');
  const given = valuesOf('given');
  const overLimit = family.length * given.length > NAME_COMBINATIONS_MAX;
  const combined = overLimit
    ? []
    : family.flatMap((f) => given.flatMap((g) => [f + g, `${f} ${g}`, `${g} ${f}`, g + f]));
  return { names: [...new Set([...valuesOf(null), ...combined])].filter(atLeastTwo), overLimit };
}
