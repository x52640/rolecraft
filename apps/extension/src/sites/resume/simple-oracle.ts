import { displayKind } from './chrome-oracle.ts';
import type { RenderOracle } from './types.ts';

/** HTML 預設為區塊層級的元素（簡化判定用）。 */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

/** 預設保留換行的元素。 */
const PRE_TAGS = new Set(['pre', 'textarea', 'listing', 'xmp']);
const PRESERVE = new Set(['pre', 'pre-wrap', 'pre-line', 'break-spaces']);

/** 讀行內 style 屬性的一個宣告（自己解析：jsdom 的 CSSStyleDeclaration 不認得部分新屬性）。 */
export function inlineDeclaration(el: Element, property: string): string | null {
  const style = el.getAttribute('style');
  if (!style) return null;
  let found: string | null = null;
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    if (part.slice(0, colon).trim().toLowerCase() === property) {
      found = part
        .slice(colon + 1)
        .trim()
        .toLowerCase();
    }
  }
  return found;
}

/** 會繼承的屬性：往上找最近一個有宣告的祖先。 */
function inherited(el: Element, property: string): string | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const value = inlineDeclaration(cur, property);
    if (value !== null) return value;
  }
  return null;
}

/**
 * 合成 DOM 測試用的簡化判定（jsdom 沒有渲染；N6）：只看行內 style 屬性與標籤預設。
 * 正式擷取一律用 `createChromeOracle`。
 */
export const simpleOracle: RenderOracle = {
  display(el) {
    const display = inlineDeclaration(el, 'display');
    if (display !== null) return displayKind(display);
    return BLOCK_TAGS.has(el.localName) ? 'block' : 'inline';
  },
  textVisible(el) {
    const visibility = inherited(el, 'visibility');
    return visibility !== 'hidden' && visibility !== 'collapse';
  },
  hidesChildren(el) {
    return inlineDeclaration(el, 'content-visibility') === 'hidden';
  },
  preservesNewlines(el) {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const value = inlineDeclaration(cur, 'white-space');
      if (value !== null) return PRESERVE.has(value);
      if (PRE_TAGS.has(cur.localName)) return true;
    }
    return false;
  },
  shadowSlots(el) {
    const shadow = el.shadowRoot;
    return shadow ? Array.from(shadow.querySelectorAll('slot')) : null;
  },
};
