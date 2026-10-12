import { isReadableChain, isSkipped, renderedChildNodes, textOf } from './render.ts';
import { joinLines } from './text.ts';
import type { RenderOracle } from './types.ts';

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

export function isControl(el: Element): boolean {
  return el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea';
}

/**
 * 表單控制項的目前值；不讀、看不到（visibility:hidden）或沒有值回 null（select 取選中項的文字）。
 */
export function controlValue(el: Element, oracle: RenderOracle): string | null {
  if (!oracle.textVisible(el)) return null;
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
export function flatText(el: Element, oracle: RenderOracle, isNoise: NoiseMatcher = null): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const child of renderedChildNodes(node, oracle)) {
      if (child.nodeType === 3) out += textOf(child as Text, node, oracle);
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (isSkipped(element, oracle) || isControl(element) || isNoise?.(element)) continue;
      if (element.localName === 'br') {
        out += '\n';
        continue;
      }
      const breaks = oracle.display(element) === 'block';
      if (breaks) out += '\n';
      walk(element);
      if (breaks) out += '\n';
    }
  };
  walk(el);
  return out;
}

/** 站台登記的介面元素判定（區塊抽取規則 7）；null＝沒登記。 */
export type NoiseMatcher = ((el: Element) => boolean) | null;

/** 元素本身或它到根節點（不含）之間的祖先符合介面元素判定。 */
function inNoise(el: Element, root: Element, isNoise: NoiseMatcher): boolean {
  if (!isNoise) return false;
  for (let cur: Element | null = el; cur && cur !== root; cur = cur.parentElement) {
    if (isNoise(cur)) return true;
  }
  return false;
}

/** 標籤＋值的對應：dt＋dd、label＋控制項（規則 2）。 */
export interface Pairs {
  /** dd → 它前面 dt 的文字（扣掉介面元素後變空是 null：仍算配對，dd 改當段落） */
  ddLabels: Map<Element, string | null>;
  /** 已當作標籤的 dt（不另成區塊） */
  consumedDts: Set<Element>;
  /** 控制項 → 它的 label 文字與元素（扣掉介面元素後變空是 null：值改當段落） */
  controlLabels: Map<Element, { label: Element; text: string | null }>;
  /** 已當作標籤的 label → 它配到的控制項 */
  labelControls: Map<Element, Element>;
  /** 自己或任何 label 屬於介面元素的控制項，連同它的 label：整對不讀（值與標籤都不出） */
  noisePairs: Set<Element>;
}

function dlItems(dl: Element): Element[] {
  const items: Element[] = [];
  for (const child of Array.from(dl.children)) {
    if (child.localName === 'div') items.push(...Array.from(child.children));
    else items.push(child);
  }
  return items;
}

interface PairCtx {
  root: Element;
  oracle: RenderOracle;
  isNoise: NoiseMatcher;
}

/** 標籤文字扣掉介面元素（配對與否不看這個，只決定顯示的標籤）；變空回 null。 */
function shownLabel(els: readonly Element[], ctx: PairCtx): string | null {
  const parts = els
    .filter((el) => !inNoise(el, ctx.root, ctx.isNoise))
    .map((el) => flatText(el, ctx.oracle, ctx.isNoise));
  const text = joinLines(parts.join('\n'));
  return text === '' ? null : text;
}

/**
 * dt＋dd 配對。讀不到的 dt（隱藏等）不貢獻文字、而且切斷配對：後面的 dd 不繼承前一個標籤，
 * 改當一般段落（dd 本身看得到，照讀；不會把隱藏的標籤或錯的標籤套上去）。
 * 配對與否只看未過濾的結果（過濾不得解除原本被配對抑制的 dt）；介面元素只從顯示的標籤扣掉。
 */
function pairDl(dl: Element, ctx: PairCtx, pairs: Pairs): void {
  const { oracle, root } = ctx;
  let dts: Element[] = [];
  let label = '';
  let afterDd = false;
  for (const item of dlItems(dl)) {
    if (item.localName !== 'dt' && item.localName !== 'dd') continue;
    const readable = isReadableChain(item, oracle, root);
    if (item.localName === 'dt') {
      if (afterDd || !readable) dts = [];
      afterDd = false;
      if (readable) dts.push(item);
      label = readable ? joinLines(dts.map((dt) => flatText(dt, oracle)).join('\n')) : '';
      continue;
    }
    afterDd = true;
    if (!readable || label === '') continue;
    pairs.ddLabels.set(item, shownLabel(dts, ctx));
    for (const dt of dts) pairs.consumedDts.add(dt);
  }
}

/** label＋控制項配對（只看未過濾的結果）；控制項或任一 label 屬於介面元素就整對不讀。 */
function pairControl(control: Element, ctx: PairCtx, pairs: Pairs): void {
  const { oracle, root, isNoise } = ctx;
  const labels = Array.from((control as HTMLInputElement).labels ?? []).filter((label) =>
    root.contains(label),
  );
  if (inNoise(control, root, isNoise) || labels.some((label) => inNoise(label, root, isNoise))) {
    pairs.noisePairs.add(control);
    for (const label of labels) pairs.noisePairs.add(label);
  }
  if (controlValue(control, oracle) === null || !isReadableChain(control, oracle, root)) return;
  for (const label of labels) {
    if (pairs.labelControls.has(label)) continue;
    if (!isReadableChain(label, oracle, root)) continue;
    if (joinLines(flatText(label, oracle)) === '') continue;
    pairs.controlLabels.set(control, { label, text: shownLabel([label], ctx) });
    pairs.labelControls.set(label, control);
    return;
  }
}

/**
 * 先找出根節點內的標籤＋值配對，抽取時據此決定區塊種類。
 * 配對結構與沒登記過濾時相同（過濾只能讓輸出變少）；控制項或它的 label 屬於介面元素就整對不讀，
 * 標籤文字扣掉其中的介面元素。
 */
export function findPairs(
  root: Element,
  oracle: RenderOracle,
  isNoise: NoiseMatcher = null,
): Pairs {
  const pairs: Pairs = {
    ddLabels: new Map(),
    consumedDts: new Set(),
    controlLabels: new Map(),
    labelControls: new Map(),
    noisePairs: new Set(),
  };
  const ctx: PairCtx = { root, oracle, isNoise };
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const dl of all.filter((el) => el.localName === 'dl')) pairDl(dl, ctx, pairs);
  for (const control of all.filter(isControl)) {
    pairControl(control, ctx, pairs);
  }
  return pairs;
}
