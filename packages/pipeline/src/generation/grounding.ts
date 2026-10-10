/**
 * 段落文字的依據檢查（R1 檢查 3 的生成端加嚴）：段落中的網址、網域、數字、倍數／比例詞
 * 都必須出現在所引用事實項的內容（或使用者確認文字）中；段落也不得出現職缺快照的公司或職稱
 * （這些由系統帶入，不由模型寫）。比對前一律 NFKC、去零寬字元，避免全形或隱藏字元繞過。
 * 寧可多丟，不放行。
 */
import type { Claim } from '@rolecraft/contracts';
import { extractNumbers, numberKeys } from '@rolecraft/domain';

import { extractUrls } from '../analysis/urls.ts';
import type { SectionDropReason } from './types.ts';

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;

/** NFKC＋去零寬字元。 */
export function normalizeForGrounding(text: string): string {
  return text.normalize('NFKC').replace(ZERO_WIDTH, '');
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
/** 路徑結束：空白、引號、角括號、反引號、CJK 標點與漢字。 */
const PATH_STOP = String.raw`\s<>"'\x60\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF`;
const LOOSE_URL = new RegExp(
  String.raw`(?<![a-z0-9_.-])${HOST}(?![a-z0-9-])(\/[^${PATH_STOP}]*)?`,
  'giu',
);
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/u;

/**
 * 寬鬆網址：裸網域（含網址裡的主機）＋其後路徑，主機轉小寫。排除頂層是常見副檔名的
 * （檔名）；版本號、純數字因頂層必須是英文字母而不會被抓。
 */
export function extractLooseUrls(text: string): string[] {
  const tokens: string[] = [];
  for (const match of normalizeForGrounding(text).matchAll(LOOSE_URL)) {
    const tld = (match[1] ?? '').toLowerCase();
    if (FILE_EXTENSIONS.has(tld)) continue;
    const path = (match[2] ?? '').replace(TRAILING_PUNCTUATION, '');
    const host = match[0].slice(0, match[0].length - (match[2]?.length ?? 0)).toLowerCase();
    tokens.push(`${host}${path}`);
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

export interface JobIdentity {
  readonly company: string;
  readonly title: string;
}

/** 數字、網址、倍數詞只能來自引用的事實項；不得寫職缺公司或職稱。 */
export function groundingProblem(
  rawText: string,
  cited: readonly Claim[],
  job: JobIdentity,
): SectionDropReason | null {
  const text = normalizeForGrounding(rawText);
  const sources = cited
    .flatMap((c) => [c.text, c.basis.userConfirmation?.text ?? ''])
    .map(normalizeForGrounding);
  const urls = new Set(sources.flatMap(extractUrls));
  if (extractUrls(text).some((url) => !urls.has(url))) return 'link_not_in_claims';
  const loose = new Set(sources.flatMap(extractLooseUrls));
  if (extractLooseUrls(text).some((url) => !loose.has(url))) return 'link_not_in_claims';
  const keys = numberKeys(sources.join('\n'));
  for (const token of extractNumbers(text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_claims';
  }
  const multipliers = new Set(sources.flatMap(extractMultipliers));
  if (extractMultipliers(text).some((m) => !multipliers.has(m))) return 'multiplier_not_in_claims';
  const section = compact(text);
  for (const name of [job.company, job.title]) {
    const needle = compact(name);
    if (needle.length > 0 && section.includes(needle)) return 'mentions_job_identity';
  }
  return null;
}
