import { normalizeLine } from './text.ts';
import type { ResumeBlock, UiNoiseRules } from './types.ts';

/**
 * 介面字樣過濾（區塊抽取規則 7，D29）：只執行站台登記的規則，這裡不內建任何網站的字樣。
 * 過濾只會讓送出的內容變少：只丟區塊、只從標題移除登記的整段提示，不放寬任何「讀得到」的判定。
 */

/** 元素是否符合登記的選擇器（該元素整棵不讀）；選擇器寫錯當作不符（不過濾，等於沒登記）。 */
export function noiseElementMatcher(rules: UiNoiseRules | null | undefined) {
  const selectors = rules?.selectors ?? [];
  if (selectors.length === 0) return null;
  return (el: Element): boolean =>
    selectors.some((selector) => {
      try {
        return el.matches(selector);
      } catch {
        return false;
      }
    });
}

/** 標題：移除登記的整段提示字樣（不是子字串比對一般區塊），移除後合併空白。 */
function stripHints(text: string, hints: readonly string[]): string {
  let out = text;
  for (const hint of hints) {
    if (hint !== '') out = out.split(hint).join(' ');
  }
  return out === text ? text : normalizeLine(out);
}

/**
 * 依登記的規則過濾區塊：一般區塊文字完全等於登記字樣才丟（部分相符保留）；
 * 標題移除登記的提示，變空才丟。被丟區塊的下一個續行改成不續行（續行必須接在同一段後面）。
 */
export function filterNoiseBlocks(
  blocks: readonly ResumeBlock[],
  rules: UiNoiseRules | null | undefined,
): ResumeBlock[] {
  if (!rules) return [...blocks];
  const texts = new Set(rules.texts.map(normalizeLine).filter((text) => text !== ''));
  const hints = rules.headingHints.map(normalizeLine).filter((hint) => hint !== '');
  const out: ResumeBlock[] = [];
  let prevDropped = false;
  for (const block of blocks) {
    const text = block.kind === 'heading' ? stripHints(block.text, hints) : block.text;
    const drop = text === '' || (block.kind !== 'heading' && texts.has(text));
    if (!drop) {
      const continues = block.continues && !prevDropped;
      out.push(
        text === block.text && continues === block.continues
          ? block
          : { ...block, text, continues },
      );
    }
    prevDropped = drop;
  }
  return out;
}
