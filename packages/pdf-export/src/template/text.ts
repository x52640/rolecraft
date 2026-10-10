/**
 * 模板會印出的文字（依文件順序）。HTML 產生器與匯出後比對都從這裡取，
 * 確保「印什麼」與「比對什麼」是同一份來源。模板本身不額外印出任何文字
 * （條列符號、分隔線都用 CSS 畫，不是字元），所以比對時不需要排除裝飾字。
 */
import type { ResumeDocument, TemplateItem } from '../model.ts';

function itemTexts(item: TemplateItem): string[] {
  switch (item.kind) {
    case 'entry':
      return item.meta === undefined ? [item.title] : [item.title, item.meta];
    case 'paragraph':
    case 'bullet':
      return [item.text];
    case 'link':
      return [item.link.text];
  }
}

/** 依版面順序列出所有印出的文字片段。 */
export function printedTexts(doc: ResumeDocument): string[] {
  return [
    doc.name,
    ...(doc.headline === undefined ? [] : [doc.headline]),
    ...doc.contacts.map((c) => c.text),
    ...doc.sections.flatMap((s) => [s.heading, ...s.items.flatMap(itemTexts)]),
  ];
}

/**
 * 不該單獨落在頁尾的標題（段落標題、經歷標題列）。用來偵測分頁把標題和內容拆開。
 * 每個元素是該標題列印出的全部文字。
 */
export function keepWithNextTexts(doc: ResumeDocument): string[] {
  return doc.sections.flatMap((s) => [
    s.heading,
    ...s.items.flatMap((i) => (i.kind === 'entry' ? [itemTexts(i).join('')] : [])),
  ]);
}

/** 比對用：去掉所有空白（換行位置由版面決定，不影響內容）。 */
export function stripWhitespace(text: string): string {
  return text.replace(/\s+/gu, '');
}

/** 印出的所有字元（含空白，字型需要空白字形），去重。 */
export function usedCharacters(doc: ResumeDocument): string {
  return [...new Set([...printedTexts(doc).join(' ')])].join('');
}
