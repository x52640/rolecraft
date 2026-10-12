import { RESUME_BLOCK_MAX_LEVEL } from '@rolecraft/contracts';

import { controlValue, findPairs, isControl, type Pairs } from './dom.ts';
import { isChildRendered, isSkipped, renderedChildNodes, scopedOracle, textOf } from './render.ts';
import { joinLines, splitLines } from './text.ts';
import type { RenderOracle, ResumeBlock } from './types.ts';

/**
 * 區塊抽取（web-resume-capture「區塊抽取規則」1–6）：純函式，依 DOM 順序。
 * 每段文字只屬於最近的區塊；巢狀的清單、表格、標籤＋值各自成區塊，打斷外層。
 * 只產出文字：不讀屬性、不帶 HTML、不帶連結網址（規則 5）。
 */

type Shape = Pick<ResumeBlock, 'kind' | 'level' | 'label'>;
/** 抽取中間結果：一段文字（'\n' 表示換行）或已完成的區塊。 */
type Item = { text: string } | { blocks: ResumeBlock[] };
/** unit：在區塊裡，區塊層級元素只算換行；paragraph：區塊層級元素各自成段落。 */
type Mode = 'unit' | 'paragraph';

interface Ctx {
  oracle: RenderOracle;
  root: Element;
  pairs: Pairs;
}

const PARAGRAPH: Shape = { kind: 'paragraph', level: null, label: null };
const HEADING = /^h([1-6])$/u;
const LIST_TAGS = new Set(['ul', 'ol', 'menu']);

/** 逐一附加（不用 push(...大陣列)，避免超過引數上限）。 */
function append(out: ResumeBlock[], blocks: readonly ResumeBlock[]): void {
  for (const block of blocks) out.push(block);
}

/** 一段文字切行成區塊：第二個以後標 continues（規則 3、W18）。 */
function toBlocks(text: string, shape: Shape): ResumeBlock[] {
  return splitLines(text).map((line, i) => ({ ...shape, text: line, continues: i > 0 }));
}

/** 依序把文字段落切成區塊，遇到已完成的區塊就斷開。 */
function flush(items: Item[], shape: Shape): ResumeBlock[] {
  const out: ResumeBlock[] = [];
  let buffer = '';
  for (const item of items) {
    if ('text' in item) {
      buffer += item.text;
      continue;
    }
    append(out, toBlocks(buffer, shape));
    append(out, item.blocks);
    buffer = '';
  }
  append(out, toBlocks(buffer, shape));
  return out;
}

/** 清單項的層級＝根節點內（含根節點）外層清單的數目，超過 6 一律記 6。 */
function listLevel(li: Element, root: Element): number {
  let depth = 0;
  for (let cur = li === root ? null : li.parentElement; cur; cur = cur.parentElement) {
    if (LIST_TAGS.has(cur.localName)) depth += 1;
    if (cur === root) break;
  }
  return Math.min(Math.max(depth, 1), RESUME_BLOCK_MAX_LEVEL);
}

function unitShape(el: Element, ctx: Ctx): Shape | null {
  const heading = HEADING.exec(el.localName);
  if (heading) return { kind: 'heading', level: Number(heading[1]), label: null };
  if (el.localName === 'li')
    return { kind: 'list_item', level: listLevel(el, ctx.root), label: null };
  const label = el.localName === 'dd' ? ctx.pairs.ddLabels.get(el) : undefined;
  if (label !== undefined) return { kind: 'label_value', level: null, label };
  return null;
}

function scanChildren(el: Element, ctx: Ctx, mode: Mode, out: Item[]): void {
  for (const child of renderedChildNodes(el, ctx.oracle)) {
    if (child.nodeType === 3) out.push({ text: textOf(child as Text, el, ctx.oracle) });
    else if (child.nodeType === 1) scanElement(child as Element, ctx, mode, out);
  }
}

function collect(el: Element, ctx: Ctx, mode: Mode): Item[] {
  const items: Item[] = [];
  scanChildren(el, ctx, mode, items);
  return items;
}

function pairBlocks(label: string, control: Element, ctx: Ctx): ResumeBlock[] {
  const value = controlValue(control, ctx.oracle) ?? '';
  return toBlocks(value, { kind: 'label_value', level: null, label });
}

/** 表單控制項與 label：配成對的在 label（包住控制項時）或控制項的位置出一次。 */
function scanFormPart(el: Element, ctx: Ctx, out: Item[]): boolean {
  const pairedControl = ctx.pairs.labelControls.get(el);
  if (pairedControl) {
    if (el.contains(pairedControl)) {
      const text = ctx.pairs.controlLabels.get(pairedControl)?.text ?? '';
      out.push({ blocks: pairBlocks(text, pairedControl, ctx) });
    }
    return true;
  }
  if (!isControl(el)) return false;
  const paired = ctx.pairs.controlLabels.get(el);
  if (paired) {
    if (!paired.label.contains(el)) out.push({ blocks: pairBlocks(paired.text, el, ctx) });
    return true;
  }
  const value = controlValue(el, ctx.oracle);
  if (value !== null) out.push({ text: ` ${value} ` });
  return true;
}

function scanElement(el: Element, ctx: Ctx, mode: Mode, out: Item[]): void {
  if (isSkipped(el, ctx.oracle)) return;
  if (el.localName === 'br') {
    out.push({ text: '\n' });
    return;
  }
  if (scanFormPart(el, ctx, out)) return;
  if (ctx.pairs.consumedDts.has(el)) return;
  if (el.localName === 'tr') {
    out.push({ blocks: rowBlocks(el, ctx) });
    return;
  }
  const shape = unitShape(el, ctx);
  if (shape) {
    out.push({ blocks: flush(collect(el, ctx, 'unit'), shape) });
    return;
  }
  if (ctx.oracle.display(el) !== 'block') {
    scanChildren(el, ctx, mode, out);
    return;
  }
  if (mode === 'paragraph') {
    out.push({ blocks: flush(collect(el, ctx, 'paragraph'), PARAGRAPH) });
    return;
  }
  out.push({ text: '\n' });
  scanChildren(el, ctx, mode, out);
  out.push({ text: '\n' });
}

function itemsText(items: Item[]): string {
  return items.map((item) => ('text' in item ? item.text : '\n')).join('');
}

function nestedBlocks(items: Item[]): ResumeBlock[] {
  return items.flatMap((item) => ('blocks' in item ? item.blocks : []));
}

/**
 * 表格列：儲存格以 Tab 連接（儲存格內的換行併成空白）；只有 th＋td 兩格的列是標籤＋值。
 * 儲存格內巢狀的清單、表格各自成區塊，排在這一列之後。
 */
function rowBlocks(tr: Element, ctx: Ctx): ResumeBlock[] {
  const cells = Array.from(tr.children).filter(
    (cell) =>
      (cell.localName === 'td' || cell.localName === 'th') &&
      !isSkipped(cell, ctx.oracle) &&
      isChildRendered(tr, cell, ctx.oracle),
  );
  const scanned = cells.map((cell) => collect(cell, ctx, 'unit'));
  const [first, second] = cells;
  if (cells.length === 2 && first?.localName === 'th' && second?.localName === 'td') {
    const label = joinLines(itemsText(scanned[0] ?? []));
    if (label !== '') {
      const shape: Shape = { kind: 'label_value', level: null, label };
      return nestedBlocks(scanned[0] ?? []).concat(flush(scanned[1] ?? [], shape));
    }
  }
  const texts = scanned.map((items) => joinLines(itemsText(items)));
  const row: ResumeBlock[] = texts.some((text) => text !== '')
    ? [{ kind: 'table_row', level: null, label: null, text: texts.join('\t'), continues: false }]
    : [];
  return row.concat(scanned.flatMap(nestedBlocks));
}

/**
 * 從根節點抽出區塊（未套上限）。根節點本身走同一套分類（標題、清單項、表格列、控制項…）；
 * 根節點的祖先是否可見由呼叫端判定。
 */
export function extractBlocks(root: Element, base: RenderOracle): ResumeBlock[] {
  const oracle = scopedOracle(base);
  const ctx: Ctx = { oracle, root, pairs: findPairs(root, oracle) };
  const items: Item[] = [];
  scanElement(root, ctx, 'paragraph', items);
  return flush(items, PARAGRAPH);
}
