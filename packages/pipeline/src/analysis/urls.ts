/**
 * 網址抽取（R1：事實項中的網址必須是原文裡的完整網址，不能截斷、拼接或捏造）。
 * 抽取 http／https 開頭與 www. 開頭的網址；遇到空白、引號、角括號、方括號、全形標點就結束，
 * 再去掉結尾的半形標點（句點、逗號等）；結尾的「)」只在 token 內括號不成對時才去掉
 * （`…/Software_(engineering)` 保留）。Markdown `[url](url)` 以方括號分隔，兩段都抽得到。
 * 事實項與原文用同一個函式抽取後做完全比對。
 */

// 結束字元：空白、引號、角括號、方括號、反引號、CJK 標點（U+3000–303F）、全形標點（U+FF01–FF0F、FF1A–FF20、FF3B–FF40、FF5B–FF65）。
const URL_STOP = String.raw`\s<>"'\x60\[\]\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65`;
const URL_PATTERN = new RegExp(String.raw`(?:https?:\/\/|www\.)[^${URL_STOP}]+`, 'giu');
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
