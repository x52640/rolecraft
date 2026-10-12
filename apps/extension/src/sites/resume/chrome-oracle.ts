import type { DisplayKind, RenderOracle } from './types.ts';

/** 不換行的 display 值（其餘都視為區塊層級，前後換行，比照 innerText）。 */
const INLINE_DISPLAYS = new Set([
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'inline-table',
  'ruby',
  'ruby-text',
]);

/** 保留換行的 white-space（舊寫法）與 white-space-collapse（新寫法）值。 */
const PRESERVE_NEWLINES = new Set(['pre', 'pre-wrap', 'pre-line', 'break-spaces']);
const PRESERVE_COLLAPSE = new Set(['preserve', 'preserve-breaks', 'break-spaces']);

/** 擴充功能環境才有：可取得封閉的 shadow root。 */
interface ChromeDom {
  dom?: { openOrClosedShadowRoot?: (el: HTMLElement) => ShadowRoot | null };
}

/** 計算後的 display 值對應成排版方式。 */
export function displayKind(display: string): DisplayKind {
  if (display === 'none') return 'none';
  if (display === 'contents') return 'contents';
  const outer = display.split(' ')[0] ?? display;
  return INLINE_DISPLAYS.has(display) || outer === 'inline' ? 'inline' : 'block';
}

/** slot 在 shadow tree 裡有沒有被藏起來（自己或祖先 display:none、content-visibility:hidden）。 */
function slotHidden(slot: Element, style: (el: Element) => CSSStyleDeclaration): boolean {
  for (let cur: Element | null = slot; cur; cur = cur.parentElement) {
    const decl = style(cur);
    if (decl.display === 'none' || decl.getPropertyValue('content-visibility') === 'hidden') {
      return true;
    }
  }
  return false;
}

/**
 * Chrome 實際渲染的判定（web-resume-capture 區塊抽取規則 6），每次擷取建一個（快取計算後樣式）。
 * 不用 `checkVisibility`：它對 display:contents 回 false，會把整棵子樹丟掉；祖先改由抽取時逐層判定。
 * 不看 content-visibility:auto，所以不限於目前捲動到的範圍。
 */
export function createChromeOracle(chromeApi?: ChromeDom): RenderOracle {
  const cache = new WeakMap<Element, CSSStyleDeclaration>();
  const style = (el: Element): CSSStyleDeclaration => {
    let decl = cache.get(el);
    if (!decl) {
      const view = el.ownerDocument.defaultView;
      if (!view) throw new Error('沒有視窗，無法判定渲染');
      decl = view.getComputedStyle(el);
      cache.set(el, decl);
    }
    return decl;
  };
  const shadowOf = (el: Element): ShadowRoot | null => {
    const open = chromeApi?.dom?.openOrClosedShadowRoot;
    return open ? open(el as HTMLElement) : el.shadowRoot;
  };
  return {
    display: (el) => displayKind(style(el).display),
    textVisible: (el) => {
      const visibility = style(el).visibility;
      return visibility !== 'hidden' && visibility !== 'collapse';
    },
    hidesChildren: (el) => style(el).getPropertyValue('content-visibility') === 'hidden',
    preservesNewlines: (el) => {
      const decl = style(el);
      if (PRESERVE_NEWLINES.has(decl.whiteSpace.split(' ')[0] ?? '')) return true;
      return PRESERVE_COLLAPSE.has(decl.getPropertyValue('white-space-collapse'));
    },
    slottedChildren: (el) => {
      const shadow = shadowOf(el);
      if (!shadow) return null;
      const nodes = new Set<Node>();
      for (const slot of Array.from(shadow.querySelectorAll('slot'))) {
        if (slotHidden(slot, style)) continue;
        for (const node of slot.assignedNodes()) nodes.add(node);
      }
      return nodes;
    },
  };
}
