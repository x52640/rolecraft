/**
 * 網址的比對式（D31；resume-import「網址與居住地遮蔽（D31）」）。在 NFKC 後的文字上比對（redact.ts），
 * 所以全形冒號、全形英數字都已換成半形；往後延伸到空白或第一個非 ASCII 字元為止（結尾多遮到的 ASCII 標點
 * 不另處理，寧可多遮）。
 * - `http://`、`https://` 開頭（不分大小寫）。
 * - `www.` 開頭（不分大小寫，前面不接英數字）。
 * - 沒有協定的網域連結（協調者裁定 2026-10-13）：常見頂級網域結尾的網域後接 `/路徑`（`github.com/帳號`、
 *   `linkedin.com/in/xxx`）。不帶路徑的網域名詞（「Node.js」「ASP.NET」「smalltown.tw」）不算；
 *   `.NET` 系列技術名（ASP.NET／VB.NET／ADO.NET）只在是獨立詞（前面不接網域字元）且斜線後只有一個技術詞時
 *   不算（「ASP.NET/C#」）；「team.asp.net/portfolio」「asp.net/portfolio」照遮（codex 審查 3）。
 *   副檔名常見的 .js .ts .py .sh .md .cc 等不列為網域，避免「deploy.sh/build.sh」誤遮。
 */

const URL_TAIL = '[!-~]*';

export const HTTP_URL = new RegExp(`https?://${URL_TAIL}`, 'giu');

export const WWW_URL = new RegExp(`(?<![A-Za-z0-9])www\\.[A-Za-z0-9-]${URL_TAIL}`, 'giu');

const TLDS = [
  'com',
  'net',
  'org',
  'edu',
  'gov',
  'io',
  'dev',
  'app',
  'ai',
  'me',
  'co',
  'tw',
  'info',
  'biz',
  'xyz',
  'page',
  'site',
  'tech',
  'design',
  'blog',
  'link',
  'cloud',
  'online',
  'store',
  'studio',
  'art',
  'works',
  'tv',
  'fm',
  'ly',
  'gl',
  'gg',
  'to',
  'so',
  'jp',
  'cn',
  'hk',
  'kr',
  'sg',
  'uk',
  'us',
  'de',
  'fr',
];

const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const TECH = [
  'c#',
  'f#',
  'c\\+\\+',
  'vb(?:\\.net)?',
  '(?:asp|ado)?\\.net(?:\\s?core)?',
  'mvc',
  'core',
  'sql',
  'web\\s?api',
  'wcf',
  'wpf',
  'winforms',
  'blazor',
  'razor',
  'linq',
  'ef',
  'javascript',
  'js',
  'jquery',
  'ajax',
];
/** 獨立的 .NET 技術詞＋斜線＋一個技術詞（之後不再接網址字元）不算網址；比對起點已保證前面不接網域字元。 */
const DOTNET_TECH = `(?!(?:asp|vb|ado)\\.net/(?:${TECH.join('|')})(?![A-Za-z0-9/._~%?#=&+-]))`;

/** 沒有協定的網域＋路徑；前面不接英數字、點、@、斜線等（email 與已有協定的網址另有比對）。 */
export const BARE_DOMAIN_PATH = new RegExp(
  `(?<![A-Za-z0-9._%+@/-])${DOTNET_TECH}(?:${LABEL}\\.)+(?:${TLDS.join('|')})(?::[0-9]+)?/${URL_TAIL}`,
  'giu',
);

export const URL_PATTERNS: readonly RegExp[] = [HTTP_URL, WWW_URL, BARE_DOMAIN_PATH];
