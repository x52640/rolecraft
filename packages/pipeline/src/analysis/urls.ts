/**
 * 網址抽取（R1：事實項中的網址必須是原文裡的完整網址，不能截斷、拼接或捏造）。
 * 抽取 http／https 開頭與 www. 開頭的網址；遇到空白、引號、角括號、全形／CJK 標點就結束，
 * 再去掉結尾的半形標點（句點、逗號等）與不成對的「)」「]」（`…/Software_(engineering)` 保留）。
 * 方括號是網址字元（`?filter[role]=admin`、IPv6 主機 `http://[abcd::ef]/x`）；Markdown 分界、
 * 截斷判斷與結尾註記見 url-scan.ts。事實項與原文用同一個函式抽取後做完全比對。
 */
import { scanUrl } from './url-scan.ts';

/**
 * 結束字元：空白、引號、角括號、反引號、CJK 標點（U+3000–303F，但 U+302A–302F 組合聲調符號與
 * U+303F 不算，避免夾在網址裡截斷）、全形標點（U+FF01–FF0F、FF1A–FF20、FF3B–FF40、FF5B–FF65）。
 */
const URL_STOP = String.raw`\s<>"'\x60\u3000-\u3029\u3030-\u303E\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65`;
const URL_RUN = new RegExp(`[^${URL_STOP}]*`, 'uy');
const URL_START = /(?:https?:\/\/|www\.)/giu;

/** 文字中所有網址 token（去掉結尾標點）。 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const start = new RegExp(URL_START);
  for (let m = start.exec(text); m !== null; m = start.exec(text)) {
    const { url, next } = scanUrl(text, m.index, URL_RUN);
    if (/^(?:https?:\/\/|www\.)./iu.test(url)) urls.push(url);
    start.lastIndex = Math.max(next, m.index + 1);
  }
  return urls;
}
