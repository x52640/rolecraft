/**
 * 網址邊界判斷（R1：網址不能被截斷後靜默放行）。完整網址（urls.ts）與寬鬆網址（generation/grounding.ts）共用。
 *
 * - 網址在結束字元（空白、引號、全形標點等）處結束；但結束字元後面「緊接」還有網址字元時
 *   （`alice"-fake`、`?id=1［&role=admin`、`?a=1！role=admin`），視為截斷，結束字元連同後面一起
 *   留在 token 裡，只有原文逐字相同才比得上（寧可判不符）。
 * - 方括號、圓括號不是結束字元（`?filter[role]=admin`、`/a[1]`、IPv6 主機都整段保留）。
 * - Markdown 分界：`](` 後接網址、`)[` 後接 `[文字](` 時切開（`[url](url)`、`[a](u1)[b](u2)`）。
 * - 結尾的方括號註記（`?id=1[作品集]`，內容含非 ASCII 字元）不算網址的一部分。
 */

/** 開括號 → 對應的閉括號（全形、CJK、直排與小型括號；半形只有 <>，() [] 本身是網址字元）。 */
const PAIRS: Readonly<Record<string, string>> = {
  '<': '>',
  '（': '）',
  '［': '］',
  '｛': '｝',
  '＜': '＞',
  '〈': '〉',
  '《': '》',
  '「': '」',
  '『': '』',
  '【': '】',
  '〔': '〕',
  '〖': '〗',
  '〘': '〙',
  '〚': '〛',
  '〝': '〞',
  '︵': '︶',
  '︷': '︸',
  '︹': '︺',
  '︻': '︼',
  '︽': '︾',
  '︿': '﹀',
  '﹁': '﹂',
  '﹃': '﹄',
  '﹙': '﹚',
  '﹛': '﹜',
  '﹝': '﹞',
};
/** 閉括號與引號：後面緊接網址字元就算截斷。 */
const CLOSERS = new Set([...Object.values(PAIRS), '"', "'", '`', '＂', '＇', '｀', '〟']);
/** 網址字元（NFKC 後）。 */
const URL_CHAR = /^[A-Za-z0-9/?#=&%_~+-]/u;
/**
 * 其他結束字元（逗號、句號、驚嘆號、漢字等）：不跨空白、後面接到網址結構字元（= & ? # /）才算截斷
 * （`?id=1！role=admin`、`?id=1[作品]&x=1`）；「，2023 年」「（已上線）」不算。
 */
const URL_STRUCTURE = /^[\p{L}\p{N}._~%+\-[\]()]*[=&?#/]/u;
const LOOKAHEAD = 64;

function startsUrlChar(text: string, at: number): boolean {
  return URL_CHAR.test(text.slice(at, at + 2).normalize('NFKC'));
}

/** 從開括號 i 找同一段（不跨空白）裡對應的閉括號；找不到回傳 -1。 */
function findClose(text: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < text.length && j < i + LOOKAHEAD * 4; j += 1) {
    const ch = text[j] ?? '';
    if (/\s/u.test(ch)) return -1;
    if (ch === open) depth += 1;
    else if (ch === close && (depth -= 1) === 0) return j;
  }
  return -1;
}

/** 位置 i 的結束字元是否截斷了網址（後面緊接還有網址字元）。 */
export function continuesUrl(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === undefined || /\s/u.test(ch)) return false;
  const close = PAIRS[ch];
  if (close !== undefined) {
    const j = findClose(text, i, ch, close);
    if (j === -1) return startsUrlChar(text, i + 1);
    // 成對的括號註記（［demo］、（已上線））：看閉括號後面
    const next = text[j + 1];
    if (next === undefined || /\s/u.test(next)) return false;
    return startsUrlChar(text, j + 1) || continuesUrl(text, j + 1);
  }
  if (CLOSERS.has(ch)) return startsUrlChar(text, i + 1);
  return URL_STRUCTURE.test(text.slice(i + 1, i + 1 + LOOKAHEAD).normalize('NFKC'));
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

const ALWAYS_TRAILING = /[.,;:!?}[]$/u;

/** 去掉結尾標點與懸空的「[」；「)」「]」只在不成對時去掉。 */
export function trimUrlEnd(token: string): string {
  let url = token;
  for (;;) {
    if (ALWAYS_TRAILING.test(url)) url = url.slice(0, -1);
    else if (url.endsWith(')') && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
    else if (url.endsWith(']') && count(url, ']') > count(url, '[')) url = url.slice(0, -1);
    else return url;
  }
}

/** 結尾的方括號註記（內容含非 ASCII 字元，例如 [作品集]）。 */
const ANNOTATION = /\[[^[\]]*\P{ASCII}[^[\]]*\]$/u;

/** Markdown 分界：`](` 後接網址，或 `)` 後接 `[文字](`。 */
const MARKDOWN_CUT = /\](?=\((?:https?:\/\/|www\.))|\)(?=\[[^\]\n]*\]\()/giu;

function markdownCut(text: string, start: number, end: number): number {
  MARKDOWN_CUT.lastIndex = start;
  const m = MARKDOWN_CUT.exec(text);
  return m && m.index < end ? m.index + 1 : -1;
}

function stickyLength(re: RegExp, text: string, at: number): number {
  re.lastIndex = at;
  return re.exec(text)?.[0].length ?? 0;
}

/**
 * 從 start 掃一段網址：先用 first 比對，再在每個截斷處（continuesUrl）吃掉結束字元並用 run 接續。
 * 回傳去掉結尾標點與註記的網址，以及下一次掃描的起點（Markdown 分界處或結尾）。
 */
export function scanUrl(
  text: string,
  start: number,
  run: RegExp,
  first: RegExp = run,
): { url: string; next: number } {
  let end = start + stickyLength(first, text, start);
  while (end < text.length && continuesUrl(text, end)) {
    end += 1;
    end += stickyLength(run, text, end);
  }
  const cut = markdownCut(text, start, end);
  const stop = cut === -1 ? end : cut;
  const url = trimUrlEnd(trimUrlEnd(text.slice(start, stop)).replace(ANNOTATION, ''));
  return { url, next: stop };
}
