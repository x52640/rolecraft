/**
 * R2 文件區塊切分：以標題或空行分隔的段落。
 *
 * 規則（ADR-0006 第 2 項定案）：
 * - 先把 CRLF／CR 統一成 LF，並去掉開頭 BOM；這兩者不算內容變更。其餘字元一律原樣比對。
 * - 空行：整行只有空白類字元（含全形空白 U+3000、NBSP、零寬字元）。空行只當分隔，不屬於任何區塊。
 * - 標題：ATX 標題行（行首最多 3 個空白後接 1–6 個 #，再接空白或行尾）。標題行自成一個區塊，
 *   並開啟新的章節；之後的區塊屬於這個章節。
 * - 區塊指紋＝SHA-256(JSON [所屬章節的標題路徑, 區塊原文])。標題改字、區塊被搬到別的章節，
 *   指紋都會變，對應事實項改待複核（寧可多複核，不可漏）。
 */

import { sha256Hex } from './sha256.ts';

export interface TextBlock {
  /** 在文件中的序號（0 起算） */
  readonly index: number;
  /** 在正規化文字中的起點（含） */
  readonly start: number;
  /** 在正規化文字中的終點（不含，不含結尾換行） */
  readonly end: number;
  /** 區塊原文（多行以 LF 連接） */
  readonly text: string;
  /** 所屬章節的標題路徑（由外而內）；標題區塊本身是它上一層的路徑 */
  readonly headingPath: readonly string[];
  /** 區塊指紋（64 字元小寫十六進位） */
  readonly fingerprint: string;
}

/** 換行統一成 LF，去掉開頭 BOM。片段原文與文件都要先過這一步再比對。 */
export function normalizeText(text: string): string {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

const BLANK_LINE = /^[\s\u200B-\u200D\u2060\uFEFF]*$/u;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/u;

export function isBlankLine(line: string): boolean {
  return BLANK_LINE.test(line);
}

export function blockFingerprint(headingPath: readonly string[], text: string): string {
  return sha256Hex(JSON.stringify([headingPath, text]));
}

/** 把文件切成區塊。輸入可為原始文字，函式內會先正規化。 */
export function splitBlocks(rawText: string): TextBlock[] {
  const text = normalizeText(rawText);
  const blocks: TextBlock[] = [];
  const headings: { level: number; title: string }[] = [];
  let current: { start: number; end: number } | null = null;

  const pushBlock = (start: number, end: number, headingPath: readonly string[]): void => {
    const blockText = text.slice(start, end);
    blocks.push({
      index: blocks.length,
      start,
      end,
      text: blockText,
      headingPath,
      fingerprint: blockFingerprint(headingPath, blockText),
    });
  };
  const flush = (): void => {
    if (current)
      pushBlock(
        current.start,
        current.end,
        headings.map((h) => h.title),
      );
    current = null;
  };

  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    const heading = ATX_HEADING.exec(line);
    if (isBlankLine(line)) {
      flush();
    } else if (heading) {
      flush();
      const level = heading[1]?.length ?? 1;
      while (headings.length > 0 && (headings.at(-1)?.level ?? 0) >= level) headings.pop();
      pushBlock(
        lineStart,
        lineEnd,
        headings.map((h) => h.title),
      );
      headings.push({ level, title: line });
    } else if (current) {
      current.end = lineEnd;
    } else {
      current = { start: lineStart, end: lineEnd };
    }
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  flush();
  return blocks;
}
