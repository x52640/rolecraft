import { describe, expect, it } from 'vitest';

import { claim } from './fixtures.test-helpers.ts';
import { extractLooseUrls, groundingProblem } from './grounding.ts';

const job = { company: 'Zzqx', title: 'Qqzz' };
const cite = (text: string) => [claim('c1', { type: 'link', text, completionStatus: null })];

describe('不可見字元（P1-T056 對抗驗證）', () => {
  it.each([
    '請見 evil️.com',
    '聯絡 bob@evil️.com',
    '請見 evil᠋.com',
    '請見 evil\u{E0100}.com',
    '請見 evilㅤ.com',
    '請見 evil.️com',
  ])('%s 抓得到 evil.com 並擋下', (text) => {
    expect(extractLooseUrls(text)).toEqual(['evil.com']);
    expect(groundingProblem(text, cite('我做過專案'), job)).toBe('link_not_in_claims');
  });
});

describe('網址截斷不放行（P1-T056 對抗驗證）', () => {
  it.each([
    ['見 https://a.com/x?id=1', '見 https://a.com/x?id=1[&role=admin'],
    ['見 https://a.com/x?id=1', '見 https://a.com/x?id=1]&role=admin'],
    ['見 https://a.com/x?id=1', '見 a.com/x?id=1[&role=admin'],
    ['見 https://a.com/x?id=1', '見 https://a.com/x?id=1！role=admin'],
    ['見 https://a.com/x?id=1', '見 https://a.com/x?id=1［&role=admin'],
    ['見 https://a.com/x?a[[b]]=user', '見 https://a.com/x?a[[b]]=admin'],
    ['連結 https://a.com/?filter[role[name]]=user', '連結 https://a.com/?filter[role[name]]=admin'],
    ['https://a.com/?id=5', 'https://a.com/?id=5[&role=admin'],
    ['見 https://github.com/alice', '見 https://github.com/alice〪-fake'],
    ['見 https://github.com/alice', '見 https://github.com/alice〿-fake'],
    ['見 https://a.com/a[1]', '見 https://a.com/a[2]'],
    ['見 a.com/x?id=1', '見 a.com/x?id=1[作品]&role=admin'],
    ['見 a.com/x', '見 a.com/x"-fake'],
  ])('原文 %s，段落 %s → 擋下', (source, text) => {
    expect(groundingProblem(text, cite(source), job)).toBe('link_not_in_claims');
  });
});

describe('Markdown 分界與註記不誤拒（P1-T056 對抗驗證）', () => {
  it.each([
    [
      '作品 https://a.com?id=1 與 https://b.com',
      '[作品](https://a.com?id=1)[GitHub](https://b.com)',
    ],
    ['作品 https://github.com/x?tab=repos［GitHub］', 'https://github.com/x?tab=repos（GitHub）'],
    ['https://a.com?id=1[作品集]', 'https://a.com?id=1 作品集'],
    ['作品集 https://a.com/x', '網站 https://a.com/x（已上線）'],
  ])('原文 %s，段落 %s → 通過', (source, text) => {
    expect(groundingProblem(text, cite(source), job)).toBeNull();
  });
});
