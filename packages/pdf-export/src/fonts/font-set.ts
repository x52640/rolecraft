/**
 * 字型資訊與缺字檢查（ADR-0005 檢查 2）。用 HarfBuzz（WebAssembly）讀字型的 cmap，
 * 匯出前就擋下字型沒有的字，不讓 Chrome 偷偷改用系統字型補字。
 */
import { Blob, Face } from 'harfbuzzjs';

/** 匯出用的一組字型：靜態 TrueType 400／700（ADR-0005）。 */
export interface FontSet {
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
}

export interface FontInfo {
  /** name table 第 6 號（PostScript 名稱），PDF 內的字型名會是「XXXXXX+這個名字」 */
  readonly postscriptName: string;
  readonly codePoints: ReadonlySet<number>;
  /** 有 glyf 表才是 TrueType 外框；CFF 外框在 Chrome 會變 Type3（ADR-0005 發現 3） */
  readonly trueTypeOutlines: boolean;
  /** 有 fvar 表就是可變字重字型，Chrome 也會輸出 Type3 */
  readonly variable: boolean;
}

export function describeFont(bytes: Uint8Array): FontInfo {
  // harfbuzzjs 以 FinalizationRegistry 回收 WASM 記憶體，不需手動釋放。
  const face = new Face(new Blob(bytes));
  return {
    postscriptName: face.getName(6, 'en'),
    codePoints: new Set(face.collectUnicodes()),
    trueTypeOutlines: face.referenceTable('glyf') !== undefined,
    variable: face.referenceTable('fvar') !== undefined,
  };
}

/** HTML 會把這些空白收合成一般空白，不會印出原字元。 */
const COLLAPSED_WHITESPACE = new Set(['\t', '\n', '\r', '\f']);

export interface MissingGlyph {
  readonly char: string;
  /** 例如 U+20BB7 */
  readonly codePoint: string;
}

export function formatCodePoint(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** 回傳 text 中任一字型沒有字形的字（去重、依出現順序）。 */
export function findMissingGlyphs(text: string, fonts: readonly FontInfo[]): MissingGlyph[] {
  const seen = new Set<string>();
  const missing: MissingGlyph[] = [];
  for (const char of text) {
    if (seen.has(char) || COLLAPSED_WHITESPACE.has(char)) continue;
    seen.add(char);
    const cp = char.codePointAt(0) ?? 0;
    if (fonts.some((f) => !f.codePoints.has(cp))) {
      missing.push({ char, codePoint: formatCodePoint(char) });
    }
  }
  return missing;
}
