import type { RenderOracle } from './types.ts';

/**
 * 「讀得到」的判定（區塊抽取規則 1）：抽取（`extract.ts`）與平面文字（`dom.ts` `flatText`）共用，
 * 兩邊對隱藏內容的處理必須一致。
 */

/**
 * 不讀的元素：腳本、樣式、樣板、svg、圖片（含 alt）、其他嵌入內容（只讀主框架），
 * 以及 progress／meter（裡面的後備文字瀏覽器不顯示）。
 */
const SKIP_TAGS = new Set([
  'audio',
  'canvas',
  'datalist',
  'embed',
  'iframe',
  'img',
  'map',
  'meter',
  'noscript',
  'object',
  'picture',
  'progress',
  'script',
  'style',
  'svg',
  'template',
  'video',
]);

/** 元素本身整棵不讀（不含祖先判定）。 */
export function isSkipped(el: Element, oracle: RenderOracle): boolean {
  if (SKIP_TAGS.has(el.localName)) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  return oracle.display(el) === 'none';
}

/** 每次擷取一份的快取（DOM 之後可能變，所以只掛在 `scopedOracle` 建出的物件上）。 */
interface RenderCache {
  summary: WeakMap<Element, Element | null>;
  slotted: WeakMap<Element, ReadonlySet<Node> | null>;
}
const caches = new WeakMap<RenderOracle, RenderCache>();

/**
 * 這次擷取專用的判定物件：同一個父節點的 details／slot 判定只算一次（避免大量子節點時 O(N²)）。
 * 擷取流程開頭建一個、整次擷取共用；傳入已是這種物件就原樣回傳。
 */
export function scopedOracle(oracle: RenderOracle): RenderOracle {
  if (caches.has(oracle)) return oracle;
  const scoped = { ...oracle };
  caches.set(scoped, { summary: new WeakMap(), slotted: new WeakMap() });
  return scoped;
}

function memo<V>(
  oracle: RenderOracle,
  pick: (cache: RenderCache) => WeakMap<Element, V>,
  el: Element,
  compute: () => V,
): V {
  const cache = caches.get(oracle);
  if (!cache) return compute();
  const map = pick(cache);
  if (map.has(el)) return map.get(el) as V;
  const value = compute();
  map.set(el, value);
  return value;
}

function firstSummary(details: Element, oracle: RenderOracle): Element | null {
  return memo(
    oracle,
    (c) => c.summary,
    details,
    () => {
      for (let child = details.firstElementChild; child; child = child.nextElementSibling) {
        if (child.localName === 'summary') return child;
      }
      return null;
    },
  );
}

/**
 * slot 在 shadow tree 裡有沒有被渲染：slot 自己與它到 shadow root 的每一層祖先都要讀得到、
 * 被父節點渲染（未展開 details、display:none、hidden、content-visibility:hidden、巢狀 host 沒分配等都算藏）。
 * 走不到 shadow root（脫離文件等判斷不了的情況）一律當藏起來。
 */
function isSlotRendered(slot: Element, oracle: RenderOracle): boolean {
  if (oracle.hidesChildren(slot)) return false;
  for (let cur: Element = slot; ;) {
    if (isSkipped(cur, oracle)) return false;
    const parent = cur.parentElement;
    if (!parent) return cur.parentNode?.nodeType === 11;
    if (!isChildRendered(parent, cur, oracle)) return false;
    cur = parent;
  }
}

/** 元素有 shadow root 時，被分配到可見 slot 的子節點；沒有 shadow root 回 null。 */
function slottedChildren(host: Element, oracle: RenderOracle): ReadonlySet<Node> | null {
  return memo(
    oracle,
    (c) => c.slotted,
    host,
    () => {
      const slots = oracle.shadowSlots(host);
      if (slots === null) return null;
      const nodes = new Set<Node>();
      for (const slot of slots) {
        if (!isSlotRendered(slot, oracle)) continue;
        for (const node of slot.assignedNodes()) nodes.add(node);
      }
      return nodes;
    },
  );
}

/**
 * 子節點有沒有被父元素渲染：content-visibility:hidden 的子節點、未展開 details 裡第一個 summary 以外的
 * 子節點、有 shadow root 時沒被分配到可見 slot 的子節點都不渲染。
 */
export function isChildRendered(parent: Element, child: Node, oracle: RenderOracle): boolean {
  if (oracle.hidesChildren(parent)) return false;
  if (parent.localName === 'details' && !parent.hasAttribute('open')) {
    return child === firstSummary(parent, oracle);
  }
  const slotted = slottedChildren(parent, oracle);
  return slotted === null || slotted.has(child);
}

/** 會被渲染的子節點（文字與元素；元素本身是否不讀另由 `isSkipped` 判定）。 */
export function renderedChildNodes(el: Element, oracle: RenderOracle): ChildNode[] {
  return Array.from(el.childNodes).filter((child) => isChildRendered(el, child, oracle));
}

/** 文字節點的內容：父元素文字不可見回空字串；不保留換行時換行當空白。 */
export function textOf(text: Text, parent: Element, oracle: RenderOracle): string {
  if (!oracle.textVisible(parent)) return '';
  const data = text.data.replace(/\r\n?/gu, '\n');
  return oracle.preservesNewlines(parent) ? data : data.replace(/\n+/gu, ' ');
}

/**
 * 元素與它到 `stop`（不含）之間的祖先都讀得到，且每一層都被父元素渲染（到 `stop` 為止）。
 * `stop` 為 null 時一路看到文件根。
 */
export function isReadableChain(el: Element, oracle: RenderOracle, stop: Element | null): boolean {
  for (let cur: Element | null = el; cur && cur !== stop; cur = cur.parentElement) {
    if (isSkipped(cur, oracle)) return false;
    const parent = cur.parentElement;
    if (parent && !isChildRendered(parent, cur, oracle)) return false;
  }
  return true;
}
