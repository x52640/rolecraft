/**
 * 承諾與聯絡方式檢查（F08：不擅自承諾面試時間、薪資或到職日）。不只靠提示：生成端逐字檢查，
 * 草稿出現時間／日期、薪資待遇、到職或開始相關字眼就整份丟棄（寧可多丟，不放行）。
 * 連「詢問」也一併擋下：要談這些由使用者自己在草稿裡補寫。
 * 另擋 email 樣式（含 at／dot 寫法）與通訊軟體帳號（LINE、WeChat、Telegram、WhatsApp＋ID）。
 * 比對前一律 normalizeLooseDots（NFKC、去隱形字元、點的變體轉「.」；email 的 dot 寫法靠它）並轉小寫；
 * 中文關鍵字另對「去掉所有空白」的版本再比一次，避免「到 職」之類拆字繞過。
 */
import { normalizeLooseDots } from '../generation/grounding.ts';
import type { DraftProblem } from './types.ts';

const any = (parts: readonly string[]) => new RegExp(parts.join('|'), 'u');

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const ORDINAL_WORDS =
  'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|' +
  'thirteenth|fourteenth|fifteenth|twentieth|thirtieth';

const TIME = any([
  '星期[一二三四五六日天]',
  '[週周][一二三四五六日末]',
  '禮拜[一二三四五六日天]?',
  '礼拜[一二三四五六日天]?',
  '今天|明天|後天|后天|今晚|明早|明晚',
  '[下本這这][個个]?(?:週|周|星期|禮拜|礼拜|月)',
  '[月年][底初中]',
  '[上中下]旬',
  '上午|下午|早上|晚上|中午|傍晚|晚間|晚间|午後|午后|早晨|清晨|凌晨|黃昏|黄昏|夜間|夜间',
  '假日|平日|過年|过年|節後|节后',
  '隨時|随时|任何時[間候]|任何时[间候]|立即|馬上|马上',
  String.raw`\d{1,2}\s*:\s*\d{2}`,
  String.raw`\d{1,4}\s*\/\s*\d{1,2}`,
  String.raw`\d+\s*月\s*\d+\s*[日號号]`,
  String.raw`\d+\s*[點点](?:\s*\d+\s*分|半|鐘|钟)?`,
  String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`,
  String.raw`\b(?:today|tomorrow|tonight|weekends?|weekdays?|anytime|immediately|asap)\b`,
  String.raw`\b(?:morning|afternoon|evening|noon)s?\b`,
  String.raw`\bany\s+time\b|\bas\s+soon\s+as\s+possible\b|\bright\s+away\b`,
  String.raw`\b(?:next|this)\s+(?:week|month)\b`,
  String.raw`\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])`,
  String.raw`\bo'clock\b`,
  String.raw`\b(?:${MONTHS})\b`,
  String.raw`\b\d+(?:st|nd|rd|th)\b`,
  String.raw`\b(?:${ORDINAL_WORDS})\b`,
]);

const SALARY = any([
  '薪|待遇|報酬|报酬|酬勞|酬劳|年終|年终|獎金|奖金|分紅|分红|股票|認股|认股',
  '收入|年收|月收|新台幣|新臺幣',
  String.raw`nt\$|\btwd\b|\busd\b|\$\s*\d`,
  String.raw`\b(?:salary|salaries|compensation|wages?|pay|paid|bonus|equity|package|income)\b`,
  String.raw`\bstock\s+options?\b|\bpay\s+range\b`,
]);

const START_DATE = any([
  '到職|到职|報到|报到|入職|入职|就職|就职|到任|上工|上班',
  '加入|開始|开始|可開始|可开始|即可|交接|離職|离职',
  String.raw`\b(?:begin|began|beginning|join|joins|joined|joining|start|starts|started|starting)\b`,
  String.raw`\bavailab(?:le|ility)\b|\bonboard(?:ing)?\b|\bnotice\s+period\b`,
]);

/** email 樣式：@、(at)、[at]、「 at 」＋網域（點的變體已正規化成「.」）。 */
const EMAIL = /[\w.+-]+\s*(?:@|[[(]\s*at\s*[\])]|\s+at\s+)\s*[\w-]+(?:\.[\w-]+)+/u;

/** 通訊軟體帳號：名稱＋ID／帳號＋值，或名稱後直接接冒號與值。 */
const MESSENGER = any([
  String.raw`\b(?:line|wechat|weixin|telegram|whatsapp|tg)\s*(?:id|帳號|账号|號|号)\s*[:：]?\s*[@\w.-]{2,}`,
  String.raw`\b(?:line|wechat|weixin|telegram|whatsapp)\s*[:：]\s*[@\w.-]{2,}`,
  String.raw`(?:微信|賴)\s*(?:id|帳號|账号|號|号)?\s*[:：]\s*[@\w.-]{2,}`,
]);

/** 草稿中的承諾類或聯絡方式問題（依時間、薪資、到職、聯絡方式順序回第一個）；沒有回 null。 */
export function commitmentProblem(draft: string): DraftProblem | null {
  const text = normalizeLooseDots(draft).toLowerCase();
  const compact = text.replace(/\s+/gu, '');
  const hit = (pattern: RegExp) => pattern.test(text) || pattern.test(compact);
  if (hit(TIME)) return 'commits_time';
  if (hit(SALARY)) return 'commits_salary';
  if (hit(START_DATE)) return 'commits_start_date';
  if (EMAIL.test(text) || hit(MESSENGER)) return 'contact_info';
  return null;
}
