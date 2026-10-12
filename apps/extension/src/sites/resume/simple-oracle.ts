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

function inlineStyle(el: Element): CSSStyleDeclaration | null {
  return 'style' in el ? (el as HTMLElement).style : null;
}

/**
 * 合成 DOM 測試用的簡化判定（jsdom 沒有渲染；N6）：只看行內 style 與標籤預設。
 * 正式擷取一律用 `chromeOracle`。
 */
export const simpleOracle: RenderOracle = {
  isRendered(el) {
    const style = inlineStyle(el);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  },
  breaksLine(el) {
    const display = inlineStyle(el)?.display ?? '';
    if (display !== '') return !display.startsWith('inline') && display !== 'contents';
    return BLOCK_TAGS.has(el.localName);
  },
};
