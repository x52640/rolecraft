/**
 * 段落文字的依據檢查（R1 檢查 3 的生成端加嚴）：段落中的網址、網域、數字、倍數／比例詞
 * 都必須出現在所引用事實項的內容（或使用者確認文字）中；段落也不得出現職缺快照的公司或職稱
 * （這些由系統帶入，不由模型寫）。比對前一律正規化（normalizeForGrounding：NFKC＋去隱形字元），
 * 寬鬆網域另把「。」「[.]」「 dot 」之類點的變體轉成「.」（normalizeLooseDots），避免繞過。
 * 寧可多丟，不放行。
 */
import type { Claim } from '@rolecraft/contracts';
import { extractNumbers, numberKeys } from '@rolecraft/domain';

import { continuesUrl, scanUrl } from '../analysis/url-scan.ts';
import { extractUrls } from '../analysis/urls.ts';
import type { SectionDropReason } from './types.ts';

/**
 * 不可見字元：Default_Ignorable_Code_Point（零寬、變體選擇符 U+FE0F／U+E0100、蒙古文變體選擇符、
 * Hangul 填充字 U+3164、組合字形連接符 U+034F 等）與所有格式字元（\p{Cf}）。
 */
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
/** 中日文句點變體（NFKC 後仍不是「.」的）：當成點，避免「example。com」繞過網域檢查。 */
const IDEOGRAPHIC_DOTS = /[\u3002\uFF61\uFE52]/gu;
/** 「[.]」「(.)」「[dot]」「(dot)」寫法。 */
const BRACKET_DOT = /\s*[[(]\s*(?:\.|dot)\s*[\])]\s*/giu;
/** 「 dot 」寫法（前後要有空白）。 */
const SPACED_DOT = /\s+dot\s+/giu;

/**
 * 抽完整網址前當成分隔的全形／CJK 標點（NFKC 後會變成半形 , ! ; ? 括號引號等而黏進網址）。
 * 冒號、斜線、點、@ 等網址結構字元不在內，全形寫的網址仍抽得到。
 */
const URL_SEPARATORS =
  /[\uFF01\uFF02\uFF07-\uFF09\uFF0C\uFF1B\uFF1C\uFF1E\uFF1F\uFF3B\uFF3D\uFF40\uFF5B\uFF5D\uFE10\uFE14-\uFE18\uFE35-\uFE44\uFE50\uFE51\uFE54\uFE56\uFE57\uFE59-\uFE5E]/gu;

/**
 * 數字、完整網址、倍數詞、職缺名稱比對用：只做 NFKC＋去隱形字元。
 * 句點變體不在這裡轉，否則「3。14 位」會變成 3.14。
 */
export function normalizeForGrounding(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE, '');
}

/**
 * 寬鬆網域與 email 辨識用：再把點的變體一律轉成「.」。寧可多丟：中文句號也會變成點，
 * 所以「TypeScript。Next」這種寫法可能被當成網域而丟段。
 */
export function normalizeLooseDots(text: string): string {
  return normalizeForGrounding(text)
    .replace(IDEOGRAPHIC_DOTS, '.')
    .replace(BRACKET_DOT, '.')
    .replace(SPACED_DOT, '.');
}

/** 全形方括號包住的 IPv6 位址（［abcd::ef］）：先換成半形，避免被當成分隔而抽不到網址。 */
const FULLWIDTH_IPV6 =
  /\uFF3B([0-9a-f.\uFF10-\uFF19\uFF21-\uFF26\uFF41-\uFF46\uFF0E]*[:\uFF1A][0-9a-f:.\uFF10-\uFF19\uFF21-\uFF26\uFF41-\uFF46\uFF0E\uFF1A]*)\uFF3D/giu;

/**
 * 把全形／CJK 標點換成空白（在 NFKC 之前做，否則會變成半形黏進網址）。但標點後面緊接網址字元時
 * （`?filter［role］=admin`、`?id=1！role=admin`）是截斷，不換，讓它留在網址 token 裡（寧可判不符）。
 */
function separateUrls(text: string): string {
  const visible = text.replace(INVISIBLE, '').replace(FULLWIDTH_IPV6, '[$1]');
  return visible.replace(URL_SEPARATORS, (ch: string, at: number) =>
    continuesUrl(visible, at) ? ch : ' ',
  );
}

/** 完整網址抽取：先把全形／CJK 標點換成空白，再正規化。段落與訊息草稿共用。 */
export function fullUrls(text: string): string[] {
  return extractUrls(normalizeForGrounding(separateUrls(text)));
}

/** 常見檔名副檔名：`README.md`、`Node.js` 之類不當成網域。 */
const FILE_EXTENSIONS = new Set(
  (
    'md txt pdf js mjs cjs ts tsx jsx json py rb go rs java kt swift c h cpp cs php sh bat ps1 ' +
    'png jpg jpeg gif svg webp ico bmp mp3 mp4 mov wav html htm css scss less csv tsv yml yaml ' +
    'xml toml ini cfg conf env log lock doc docx xls xlsx ppt pptx key zip tar gz tgz rar 7z dmg ' +
    'exe apk ipa sql db sqlite vue svelte'
  ).split(' '),
);

const HOST = String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24})`;
/**
 * 路徑結束：空白、引號、角括號、反引號、CJK 標點（U+302A–302F、U+303F 除外）與漢字。
 * 方括號是網址字元；Markdown 分界、截斷與結尾註記交給 scanUrl（與完整網址同規則）。
 */
const PATH_STOP = String.raw`\s<>"'\x60\u3000-\u3029\u3030-\u303E\u3400-\u4DBF\u4E00-\u9FFF`;
const PATH_FIRST = new RegExp(`(?:[/?][^${PATH_STOP}]*)?`, 'uy');
const PATH_RUN = new RegExp(`[^${PATH_STOP}]*`, 'uy');
const LOOSE_HOST = new RegExp(String.raw`(?<![a-z0-9_.-])${HOST}(?![a-z0-9-])`, 'giu');
/** 「[.]」「（．）」「［dot］」等含全形括號的點寫法：要在全形標點換成空白之前先轉成「.」。 */
const RAW_BRACKET_DOT =
  /\s*[[(\uFF08\uFF3B]\s*(?:[.\uFF0E\u3002\uFF61\uFE52]|dot|\uFF44\uFF4F\uFF54)\s*[\])\uFF09\uFF3D]\s*/giu;

/**
 * 寬鬆網址：裸網域（含網址裡的主機）＋其後路徑，主機轉小寫。排除頂層是常見副檔名的
 * （檔名）；版本號、純數字因頂層必須是英文字母而不會被抓。
 */
export function extractLooseUrls(text: string): string[] {
  const tokens: string[] = [];
  // 先去隱形字元再認方括號點，否則「evil［\u200B.］com」漏抓
  const separated = separateUrls(text.replace(INVISIBLE, '').replace(RAW_BRACKET_DOT, '.'));
  const loose = normalizeLooseDots(separated);
  const hosts = new RegExp(LOOSE_HOST);
  for (let m = hosts.exec(loose); m !== null; m = hosts.exec(loose)) {
    const hostEnd = m.index + m[0].length;
    if (FILE_EXTENSIONS.has((m[1] ?? '').toLowerCase())) continue;
    const { url: path, next } = scanUrl(loose, hostEnd, PATH_RUN, PATH_FIRST);
    tokens.push(`${m[0].toLowerCase()}${path}`);
    hosts.lastIndex = Math.max(next, hostEnd);
  }
  return tokens;
}

/** 倍數／比例詞（數字檢查抓不到的寫法）。 */
const MULTIPLIER = new RegExp(
  [
    '翻倍',
    '加倍',
    '倍增',
    '成倍',
    '翻番',
    '翻一番',
    '減半',
    '减半',
    '折半',
    '[零一二兩两三四五六七八九十百千幾几數数]+倍',
    String.raw`\b(?:doubl|tripl|quadrupl|quintupl|halv)(?:e|ed|es|ing)\b`,
    String.raw`\bin\s+half\b`,
    String.raw`\b(?:twice|thrice)\b`,
    String.raw`\b(?:two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|many|\d+)[\s-]?fold\b`,
  ].join('|'),
  'giu',
);

/** 文字中的倍數／比例詞（小寫、空白與連字號統一）。 */
export function extractMultipliers(text: string): string[] {
  return [...normalizeForGrounding(text).matchAll(MULTIPLIER)].map((m) =>
    m[0].toLowerCase().replace(/[\s-]+/gu, ' '),
  );
}

/** 公司、職稱比對用：NFKC、去零寬、小寫、去所有空白。 */
function compact(text: string): string {
  return normalizeForGrounding(text).toLowerCase().replace(/\s+/gu, '');
}

const escapeRegExp = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * 段落是否寫到職缺公司或職稱。純 ASCII 名稱要求前面不是英數字（LINE 不命中 pipeline／online），
 * 字母之間容許空白、-、_、.（「L I N E」「L-I-N-E」「Backend-Engineer」都命中），
 * 結尾容許英文字尾 s／es／'s／ing（「LINEs」「Engineers」「Engineering」都命中）；
 * 含中文等其他字元的名稱維持去空白後的子字串比對。寧可多丟。
 */
function mentionsName(text: string, name: string): boolean {
  const needle = compact(name);
  if (needle.length === 0) return false;
  if (!/^[\x20-\x7E]+$/u.test(needle)) return compact(text).includes(needle);
  const body = [...needle].map(escapeRegExp).join(String.raw`[\s._-]*`);
  const suffix = String.raw`(?:s|es|['\u2019]s|ing)?`;
  const pattern = new RegExp(String.raw`(?<![a-z0-9])${body}${suffix}(?![a-z0-9])`, 'u');
  return pattern.test(normalizeForGrounding(text).toLowerCase());
}

/** 公司名稱結尾的常見法人字樣（Line Corp 與 LINE Corporation 要視為同一家）。 */
const COMPANY_SUFFIX =
  /(?:[\s,.]+(?:corporation|corp|incorporated|inc|limited|ltd|company|co)\.?|股份有限公司|有限公司)\s*$/iu;

/** 去掉法人字樣後的公司核心名稱（可能是空字串，mentionsName 對空字串回傳 false）。 */
function companyCore(name: string): string {
  let core = normalizeForGrounding(name).trim();
  for (let prev = ''; prev !== core;) {
    prev = core;
    core = core.replace(COMPANY_SUFFIX, '').trim();
  }
  return core;
}

function mentionsCompany(text: string, company: string): boolean {
  return mentionsName(text, company) || mentionsName(text, companyCore(company));
}

export interface JobIdentity {
  readonly company: string;
  readonly title: string;
}

/**
 * 數字、網址、倍數詞只能來自引用的事實項（或 extraSources：經歷段落的同一段經歷描述，
 * 那是使用者確認過的文字，P1-T072）；不得寫職缺公司或職稱。
 */
export function groundingProblem(
  rawText: string,
  cited: readonly Claim[],
  job: JobIdentity,
  extraSources: readonly string[] = [],
): SectionDropReason | null {
  const raw = [
    ...cited.flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? '']),
    ...extraSources,
  ];
  const urls = new Set(raw.flatMap(fullUrls));
  if (fullUrls(rawText).some((url) => !urls.has(url))) return 'link_not_in_claims';
  const loose = new Set(raw.flatMap(extractLooseUrls));
  if (extractLooseUrls(rawText).some((url) => !loose.has(url))) return 'link_not_in_claims';
  const text = normalizeForGrounding(rawText);
  const sources = raw.map(normalizeForGrounding);
  const keys = numberKeys(sources.join('\n'));
  for (const token of extractNumbers(text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_claims';
  }
  const multipliers = new Set(sources.flatMap(extractMultipliers));
  if (extractMultipliers(text).some((m) => !multipliers.has(m))) return 'multiplier_not_in_claims';
  if (mentionsCompany(text, job.company) || mentionsName(text, job.title)) {
    return 'mentions_job_identity';
  }
  return null;
}
