/**
 * 網址抽取（R1：事實項中的網址必須是原文裡的完整網址，不能截斷、拼接或捏造）。
 * 抽取 http／https 開頭與 www. 開頭的網址；遇到空白、引號、角括號、方括號、全形標點就結束，
 * 再去掉結尾的半形標點（句點、逗號等）；結尾的「)」只在 token 內括號不成對時才去掉
 * （`…/Software_(engineering)` 保留）。Markdown `[url](url)` 以方括號分隔，兩段都抽得到；
 * 例外是緊接在 `scheme://` 後的 IPv6 主機（`http://[abcd::ef]/x`），整段當成一個網址；
 * 以及「?」之後查詢字串裡成對的方括號（`?filter[role]=admin`），保留在 token 裡，
 * 否則不同參數值會被截成同一個 `?filter` 而放行捏造的網址。
 * 事實項與原文用同一個函式抽取後做完全比對。
 */

// 結束字元：空白、引號、角括號、方括號、反引號、CJK 標點（U+3000–303F）、全形標點（U+FF01–FF0F、FF1A–FF20、FF3B–FF40、FF5B–FF65）。
const URL_STOP = String.raw`\s<>"'\x60\[\]\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65`;
/**
 * 主機之後的部分：「?」之前遇到結束字元就停；「?」之後的查詢字串另外容許成對、內部不含結束字元的
 * 方括號（`filter[role]`、`x[]`）。不成對的「]」仍是結束字元，Markdown `[url](url)` 照舊拆開。
 */
const URL_REST = String.raw`[^${URL_STOP}?]*(?:\?(?:[^${URL_STOP}]|\[[^${URL_STOP}]*\])*)?`;
/** `scheme://[userinfo@]` 後面緊接的方括號 IPv6 主機（http://[abcd::ef]/x）：方括號不當結束字元。 */
const IPV6_URL = String.raw`https?:\/\/(?:[^${URL_STOP}@\/]*@)?\[[0-9a-f.]*:[0-9a-f:.]*(?:%[\w.~-]+)?\]${URL_REST}`;
const URL_PATTERN = new RegExp(String.raw`${IPV6_URL}|(?:https?:\/\/|www\.)${URL_REST}`, 'giu');
const ALWAYS_TRAILING = /[.,;:!?}]$/u;

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** 去掉結尾標點；「)」只在不成對時去掉。 */
function trimUrlEnd(token: string): string {
  let url = token;
  for (;;) {
    if (ALWAYS_TRAILING.test(url)) url = url.slice(0, -1);
    else if (url.endsWith(')') && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
    else return url;
  }
}

/** 文字中所有網址 token（去掉結尾標點）。 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrlEnd(match[0]);
    if (/^(?:https?:\/\/|www\.)./iu.test(url)) urls.push(url);
  }
  return urls;
}
