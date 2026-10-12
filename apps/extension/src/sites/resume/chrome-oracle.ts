import type { RenderOracle } from './types.ts';

/** 不換行的 display 值（其餘都視為區塊層級，前後換行，比照 innerText）。 */
const INLINE_DISPLAYS = new Set([
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'inline-table',
  'contents',
  'ruby',
  'ruby-text',
]);

/**
 * Chrome 實際渲染的判定（web-resume-capture 區塊抽取規則 6）。
 * `checkVisibility` 會一併看祖先的 display:none；`visibilityProperty` 另擋 visibility:hidden。
 * 不看 content-visibility:auto，所以不限於目前捲動到的範圍。
 */
export const chromeOracle: RenderOracle = {
  isRendered(el) {
    return el.checkVisibility({ visibilityProperty: true });
  },
  breaksLine(el) {
    const view = el.ownerDocument.defaultView;
    if (!view) return true;
    const display = view.getComputedStyle(el).display;
    const outer = display.split(' ')[0] ?? display;
    return !INLINE_DISPLAYS.has(display) && !INLINE_DISPLAYS.has(outer);
  },
};
