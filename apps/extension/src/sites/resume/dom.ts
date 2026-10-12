import { joinLines, textNodeContent } from './text.ts';
import type { RenderOracle } from './types.ts';

/**
 * 不讀的元素（區塊抽取規則 1）：腳本、樣式、樣板、svg、圖片（含 alt）與其他嵌入內容。
 * 嵌入框架也不讀（只讀主框架）。
 */
const SKIP_TAGS = new Set([
  'audio',
  'canvas',
  'datalist',
  'embed',
  'iframe',
  'img',
  'map',
  'noscript',
  'object',
  'picture',
  'script',
  'style',
  'svg',
  'template',
  'video',
]);

/** 只讀目前值的 input 種類；其餘（密碼、隱藏、檔案、按鈕、勾選框等）一律不讀（規則 4）。 */
const READABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
]);

/** 元素本身不讀（不含祖先判定）。 */
export function isSkipped(el: Element, oracle: RenderOracle): boolean {
  if (SKIP_TAGS.has(el.localName)) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  return !oracle.isRendered(el);
}

/** 元素與它到 `stop`（不含）之間的祖先都要讀得到。`stop` 為 null 時一路看到文件根。 */
export function isReadableChain(el: Element, oracle: RenderOracle, stop: Element | null): boolean {
  for (let cur: Element | null = el; cur && cur !== stop; cur = cur.parentElement) {
    if (isSkipped(cur, oracle)) return false;
  }
  return true;
}

export function isControl(el: Element): boolean {
  return el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea';
}

/** 表單控制項的目前值；不讀或沒有值回 null（select 取選中項的文字）。 */
export function controlValue(el: Element): string | null {
  const value = rawControlValue(el);
  return value !== null && /\S/u.test(value) ? value : null;
}

function rawControlValue(el: Element): string | null {
  if (el.localName === 'input') {
    const input = el as HTMLInputElement;
    return READABLE_INPUT_TYPES.has(input.type) ? input.value : null;
  }
  if (el.localName === 'textarea') return (el as HTMLTextAreaElement).value;
  if (el.localName === 'select') {
    const options = (el as HTMLSelectElement).selectedOptions;
    return Array.from(options, (option) => option.text).join(', ');
  }
  return null;
}

/**
 * 元素的平面文字（標籤、dt、姓名用）：不讀的元素略過、表單控制項略過，
 * br 與區塊層級元素換行，不切區塊。
 */
export function flatText(el: Element, oracle: RenderOracle): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += textNodeContent((child as Text).data);
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (isSkipped(element, oracle) || isControl(element)) continue;
      if (element.localName === 'br') {
        out += '\n';
        continue;
      }
      const breaks = oracle.breaksLine(element);
      if (breaks) out += '\n';
      walk(element);
      if (breaks) out += '\n';
    }
  };
  walk(el);
  return out;
}

/** 標籤＋值的對應：dt＋dd、label＋控制項（規則 2）。 */
export interface Pairs {
  /** dd → 它前面 dt 的文字 */
  ddLabels: Map<Element, string>;
  /** 已當作標籤的 dt（不另成區塊） */
  consumedDts: Set<Element>;
  /** 控制項 → 它的 label 文字與元素 */
  controlLabels: Map<Element, { label: Element; text: string }>;
  /** 已當作標籤的 label → 它配到的控制項 */
  labelControls: Map<Element, Element>;
}

function dlItems(dl: Element): Element[] {
  const items: Element[] = [];
  for (const child of Array.from(dl.children)) {
    if (child.localName === 'div') items.push(...Array.from(child.children));
    else items.push(child);
  }
  return items;
}

function pairDl(dl: Element, root: Element, oracle: RenderOracle, pairs: Pairs): void {
  let dts: Element[] = [];
  let label = '';
  let afterDd = false;
  for (const item of dlItems(dl)) {
    if (!isReadableChain(item, oracle, root)) continue;
    if (item.localName === 'dt') {
      if (afterDd) dts = [];
      afterDd = false;
      dts.push(item);
      label = joinLines(dts.map((dt) => flatText(dt, oracle)).join('\n'));
    } else if (item.localName === 'dd') {
      afterDd = true;
      if (label === '') continue;
      pairs.ddLabels.set(item, label);
      for (const dt of dts) pairs.consumedDts.add(dt);
    }
  }
}

function pairControl(control: Element, root: Element, oracle: RenderOracle, pairs: Pairs): void {
  if (controlValue(control) === null || !isReadableChain(control, oracle, root)) return;
  const labels = (control as HTMLInputElement).labels;
  for (const label of Array.from(labels ?? [])) {
    if (pairs.labelControls.has(label) || !root.contains(label)) continue;
    if (!isReadableChain(label, oracle, root)) continue;
    const text = joinLines(flatText(label, oracle));
    if (text === '') continue;
    pairs.controlLabels.set(control, { label, text });
    pairs.labelControls.set(label, control);
    return;
  }
}

/** 先找出根節點內的標籤＋值配對，抽取時據此決定區塊種類。 */
export function findPairs(root: Element, oracle: RenderOracle): Pairs {
  const pairs: Pairs = {
    ddLabels: new Map(),
    consumedDts: new Set(),
    controlLabels: new Map(),
    labelControls: new Map(),
  };
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const dl of all.filter((el) => el.localName === 'dl')) pairDl(dl, root, oracle, pairs);
  for (const control of all.filter(isControl)) {
    pairControl(control, root, oracle, pairs);
  }
  return pairs;
}
