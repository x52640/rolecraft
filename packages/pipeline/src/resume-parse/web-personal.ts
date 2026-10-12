/**
 * 網頁來源的姓名與聯絡資料只在本機處理（D28；resume-import「網頁來源的 AI 整理」W6）。區塊依順序當成行，
 * 套用 PDF 同一套規則（labels.ts、redact.ts），另加：
 * - 標籤＋值區塊以「標籤：值」判斷：標籤是個資標籤就整塊移除、值由本機預填。
 * - 被移除區塊後面的 `continues` 區塊是同一元素的續行：一併移除，值接回同一列（W18；不適用「同一標籤只留
 *   第一個」）；遮蔽用每一段與接回後的完整值。
 * - 聯絡區：「聯絡方式」等標題區塊下，移除到下一個同級或更高級的標題區塊為止；段落形式的聯絡標題照 PDF 規則。
 * - 同一標籤的第二個值不預填，但一律加入遮蔽。
 */
import type { ImportWebDraftField, ImportWebBlock } from '@rolecraft/contracts';

import {
  isNameLabel,
  isPersonalLabel,
  isStrictPersonalLabel,
  labelOnlyLine,
  personalLabelLine,
  type LabelLine,
} from './labels.ts';
import { CONTACT_BLOCK_MAX, CONTACT_HEADINGS } from './personal.ts';
import type { Secret } from './redact.ts';
import { headingKey, isSectionHeading, normalizeForMatch } from './text.ts';

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
  readonly row: Row | null;
  readonly name: boolean;
  readonly parts: string[];
}

export interface WebSplit {
  readonly rows: readonly WebPersonalRow[];
  readonly kept: readonly ImportWebBlock[];
  /** 移除的值（每段、接回後的完整值），全部加入遮蔽 */
  readonly removed: readonly Secret[];
  /** 從區塊抽到姓名標籤的值（送出條件 (2)） */
  readonly labeledNames: readonly string[];
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
    const chain: Chain = { row, name: isNameLabel(label), parts: [clean] };
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
      last = labelLine
        ? remove(labelLine.label, labelLine.value, block)
        : remove(region.label, line, block, true);
      continue;
    }
    if (CONTACT_HEADINGS.has(headingKey(block.text)) && block.label === null) {
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
  return { rows, kept, removed: secretsOf(chains), labeledNames: namesOf(chains) };
}

/** 個資標籤行：標籤＋值區塊直接看標籤（標籤不受 24 字、冒號的寫法限制），其他區塊照 PDF 規則。 */
function labelOf(block: ImportWebBlock, line: string, labelsOnly: boolean): LabelLine | null {
  if (block.label !== null) {
    return isPersonalLabel(block.label) ? { label: block.label.trim(), value: block.text } : null;
  }
  return labelsOnly ? null : personalLabelLine(line);
}

/** 標題區塊開的聯絡區到下一個同級或更高級的標題區塊為止；段落形式的照 PDF 規則（段落標題、最多 8 行）。 */
function regionEnds(region: Region, block: ImportWebBlock): boolean {
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

function namesOf(chains: readonly Chain[]): string[] {
  return chains.filter((c) => c.name).map((c) => c.parts.join(' '));
}
