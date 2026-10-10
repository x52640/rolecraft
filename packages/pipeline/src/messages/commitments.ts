/**
 * 承諾檢查（F08：不擅自承諾面試時間、薪資或到職日）。不只靠提示：生成端逐字檢查，
 * 草稿出現時間／日期、薪資待遇、到職相關字眼就整份丟棄（寧可多丟，不放行）。
 * 連「詢問」也一併擋下：要談這些由使用者自己在草稿裡補寫。
 * 比對前一律 NFKC、去零寬字元、轉小寫，避免全形或隱藏字元繞過。
 */
import { normalizeForGrounding } from '../generation/grounding.ts';
import type { DraftProblem } from './types.ts';

const TIME = new RegExp(
  [
    '星期[一二三四五六日天]',
    '[週周][一二三四五六日末]',
    '禮拜[一二三四五六日天]?',
    '礼拜[一二三四五六日天]?',
    '今天',
    '明天',
    '後天',
    '后天',
    '今晚',
    '明早',
    '明晚',
    '[下本這这][個个]?(?:週|周|星期|禮拜|礼拜|月)',
    '月[底初中]',
    '年[底初中]',
    '上午',
    '下午',
    '早上',
    '晚上',
    '中午',
    '傍晚',
    '隨時',
    '随时',
    '任何時[間候]',
    '任何时[间候]',
    '立即',
    '馬上',
    '马上',
    String.raw`\d{1,2}\s*[:：]\s*\d{2}`,
    String.raw`\d{1,4}\s*\/\s*\d{1,2}`,
    String.raw`\d+\s*月\s*\d+\s*[日號号]`,
    String.raw`\d+\s*[點点](?:\s*\d+\s*分|半|鐘|钟)?`,
    String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`,
    String.raw`\b(?:today|tomorrow|tonight|weekend|anytime|immediately)\b`,
    String.raw`\bany\s+time\b`,
    String.raw`\b(?:next|this)\s+(?:week|month)\b`,
    String.raw`\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])`,
    String.raw`\bo'clock\b`,
  ].join('|'),
  'u',
);

const SALARY = new RegExp(
  [
    '薪',
    '待遇',
    '報酬',
    '报酬',
    '酬勞',
    '酬劳',
    '年終',
    '年终',
    '獎金',
    '奖金',
    '分紅',
    '分红',
    '股票',
    '認股',
    '认股',
    '新台幣',
    '新臺幣',
    String.raw`nt\$`,
    String.raw`\btwd\b`,
    String.raw`\busd\b`,
    String.raw`\$\s*\d`,
    String.raw`\b(?:salary|salaries|compensation|wages?|pay|paid|bonus|equity|stock\s+options?)\b`,
  ].join('|'),
  'u',
);

const START_DATE = new RegExp(
  [
    '到職',
    '到职',
    '報到',
    '报到',
    '入職',
    '入职',
    '就職',
    '就职',
    '到任',
    '上工',
    '上班',
    '可開始',
    '可开始',
    String.raw`\bstart(?:ing)?\s+(?:date|on|from|in|work)\b`,
    String.raw`\bjoin(?:ing)?\s+(?:on|from|in|by)\b`,
    String.raw`\bavailable\s+(?:from|to\s+start|starting)\b`,
    String.raw`\bonboard(?:ing)?\b`,
    String.raw`\bnotice\s+period\b`,
  ].join('|'),
  'u',
);

/** 草稿中的承諾類問題（依時間、薪資、到職日順序回第一個）；沒有回 null。 */
export function commitmentProblem(draft: string): DraftProblem | null {
  const text = normalizeForGrounding(draft).toLowerCase();
  if (TIME.test(text)) return 'commits_time';
  if (SALARY.test(text)) return 'commits_salary';
  if (START_DATE.test(text)) return 'commits_start_date';
  return null;
}
