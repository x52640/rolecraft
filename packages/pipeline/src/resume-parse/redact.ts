/**
 * 送模型前的片段遮蔽（P1-T069）：姓名、已抽出的個資值、email／電話／身分證字號換成佔位字（〔姓名〕、〔個資1〕…）。
 * 比對在 NFKC 後的文字上做（全形數字電話、全形 ＠、「+886 (0)」都認得），找到的範圍對回原文再替換；
 * 佔位字對應的是原文片段，檢查通過的值換回時與原文一字不差。
 */
import { nfkcMapped } from './text.ts';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const PHONE =
  /(?<![\d/.:-])(?:\+\d{1,3}[\s-]?(?:\(0\)[\s-]?)?\d|\(0\d{1,3}\)[\s-]?\d|0\d)(?:[\s-]?\d){6,11}(?![\d/])/gu;
const NATIONAL_ID = /(?<![A-Za-z\d])[A-Z][12]\d{8}(?!\d)/gu;
const TOKEN = /〔(?:姓名|個資)\d*〕/gu;

export interface Secret {
  readonly value: string;
  readonly name: boolean;
}

interface Span {
  readonly from: number;
  readonly to: number;
  readonly name: boolean;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function createRedactor(secrets: readonly Secret[]) {
  const tokens = new Map<string, string>();
  const byValue = new Map<string, string>();
  const counts = { name: 0, other: 0 };
  const tokenFor = (original: string, name: boolean): string => {
    const existing = byValue.get(original);
    if (existing) return existing;
    const token = name
      ? `〔姓名${(counts.name += 1) === 1 ? '' : String(counts.name)}〕`
      : `〔個資${String((counts.other += 1))}〕`;
    tokens.set(token, original);
    byValue.set(original, token);
    return token;
  };
  // 已知值（NFKC 後）長的先比；名字至少 2 字，其他值至少 3 字（避免「男」這類單字誤遮）
  const patterns = [...secrets]
    .map((s) => ({ ...s, value: s.value.normalize('NFKC').trim() }))
    .filter((s) => [...s.value].length >= (s.name ? 2 : 3))
    .sort((a, b) => b.value.length - a.value.length)
    .map((s) => ({ re: new RegExp(escape(s.value), 'gu'), name: s.name }));
  const generic = [EMAIL, PHONE, NATIONAL_ID].map((re) => ({ re, name: false }));

  function redact(original: string): string {
    const mapped = nfkcMapped(original);
    const spans: Span[] = [];
    const taken = (from: number, to: number) => spans.some((s) => from < s.to && to > s.from);
    for (const { re, name } of [...patterns, ...generic]) {
      for (const match of mapped.text.matchAll(re)) {
        const at = match.index;
        const from = mapped.start[at] ?? 0;
        const to = mapped.end[at + match[0].length - 1] ?? from;
        if (!taken(from, to)) spans.push({ from, to, name });
      }
    }
    spans.sort((a, b) => a.from - b.from);
    let out = '';
    let at = 0;
    for (const span of spans) {
      out +=
        original.slice(at, span.from) + tokenFor(original.slice(span.from, span.to), span.name);
      at = span.to;
    }
    return out + original.slice(at);
  }
  return { redact, tokens };
}

/** 佔位字換回原文；不認得的佔位字原樣保留（之後對原文的檢查會把它擋掉）。 */
export function unredact(value: string, tokens: ReadonlyMap<string, string>): string {
  return value.replace(TOKEN, (token) => tokens.get(token) ?? token);
}
