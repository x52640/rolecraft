import { describe, expect, it } from 'vitest';

import { extractUrls } from './urls.ts';

describe('extractUrls', () => {
  it('extracts complete URLs and strips trailing punctuation', () => {
    expect(extractUrls('網站 https://a.example.com/x?y=1。另見 (www.b.example.org).')).toEqual([
      'https://a.example.com/x?y=1',
      'www.b.example.org',
    ]);
    expect(extractUrls('見「https://c.example.com」，或 http://d.example.com, 結束')).toEqual([
      'https://c.example.com',
      'http://d.example.com',
    ]);
    expect(extractUrls('沒有網址 example.com https://')).toEqual([]);
  });

  it('keeps balanced closing parentheses and strips unbalanced ones（P1-T047）', () => {
    expect(extractUrls('見 https://en.wikipedia.org/wiki/Software_(engineering)。')).toEqual([
      'https://en.wikipedia.org/wiki/Software_(engineering)',
    ]);
    expect(extractUrls('(see https://x.example.com/a_(b)).')).toEqual([
      'https://x.example.com/a_(b)',
    ]);
  });

  it('splits Markdown links at brackets（P1-T047）', () => {
    expect(extractUrls('[https://a.example.com/x](https://a.example.com/x)')).toEqual([
      'https://a.example.com/x',
      'https://a.example.com/x',
    ]);
    expect(extractUrls('[www.b.example.org]')).toEqual(['www.b.example.org']);
  });
});

describe('extractUrls IPv6（P1-T047 對抗驗證）', () => {
  it('keeps a bracketed IPv6 host right after scheme://', () => {
    expect(extractUrls('服務入口 http://[abcd::ef]/admin，見')).toEqual([
      'http://[abcd::ef]/admin',
    ]);
    expect(extractUrls('http://[::ffff:abcd:ef]/x')).toEqual(['http://[::ffff:abcd:ef]/x']);
    expect(extractUrls('https://[abcd::ef]')).toEqual(['https://[abcd::ef]']);
    expect(extractUrls('https://user@[abcd::ef]:8080/x.')).toEqual([
      'https://user@[abcd::ef]:8080/x',
    ]);
  });

  it('still splits Markdown links after an IPv6 URL', () => {
    expect(extractUrls('[http://[abcd::ef]/a](http://[abcd::ef]/a)')).toEqual([
      'http://[abcd::ef]/a',
      'http://[abcd::ef]/a',
    ]);
  });
});

describe('extractUrls 截斷不放行、Markdown 分界（P1-T056 對抗驗證）', () => {
  it('結束字元後緊接網址字元：不得截成較短的網址', () => {
    for (const text of [
      '見 https://a.com/x?id=1[&role=admin',
      '見 https://a.com/x?id=1]&role=admin',
      '見 https://a.com/x?id=1［&role=admin',
      '見 https://a.com/x?id=1"&role=admin',
      '見 https://a.com/x?id=1！role=admin',
    ]) {
      expect(extractUrls(text)).not.toContain('https://a.com/x?id=1');
    }
    for (const text of [
      'https://github.com/alice〪-fake',
      'https://github.com/alice〿-fake',
      'https://github.com/alice"-fake',
    ]) {
      expect(extractUrls(text)).not.toContain('https://github.com/alice');
    }
  });

  it('巢狀方括號與路徑方括號整段保留', () => {
    expect(extractUrls('https://a.com/x?a[[b]]=admin')).toEqual(['https://a.com/x?a[[b]]=admin']);
    expect(extractUrls('https://a.com/a[1]/b')).toEqual(['https://a.com/a[1]/b']);
  });

  it('相連的 Markdown 連結與結尾註記', () => {
    expect(extractUrls('[作品](https://a.com?id=1)[GitHub](https://b.com)')).toEqual([
      'https://a.com?id=1',
      'https://b.com',
    ]);
    expect(extractUrls('https://a.com?id=1[作品集]')).toEqual(['https://a.com?id=1']);
    expect(extractUrls('https://a.com/x（已上線）')).toEqual(['https://a.com/x']);
    expect(extractUrls('https://a.com，2023 年上線')).toEqual(['https://a.com']);
    expect(extractUrls('https://a.com?tab=repos［GitHub］')).toEqual(['https://a.com?tab=repos']);
  });
});

describe('extractUrls 查詢參數方括號（P1-T056）', () => {
  it('keeps brackets inside the query string', () => {
    expect(extractUrls('見 https://a.example.com/list?filter[role]=admin&x[]=1。')).toEqual([
      'https://a.example.com/list?filter[role]=admin&x[]=1',
    ]);
    expect(extractUrls('www.b.example.org/?a[b][c]=d')).toEqual(['www.b.example.org/?a[b][c]=d']);
    expect(extractUrls('http://[abcd::ef]/q?f[k]=v')).toEqual(['http://[abcd::ef]/q?f[k]=v']);
  });

  it('distinguishes URLs that differ only inside query brackets', () => {
    const [made] = extractUrls('https://a.example.com/?filter[role]=admin');
    const [source] = extractUrls('https://a.example.com/?filter[role]=user');
    expect(made).not.toBe(source);
  });

  it('still splits Markdown links whose URL has a query', () => {
    expect(extractUrls('[https://a.example.com/?f[k]=v](https://a.example.com/?f[k]=v)')).toEqual([
      'https://a.example.com/?f[k]=v',
      'https://a.example.com/?f[k]=v',
    ]);
    expect(extractUrls('[https://a.example.com/?y=1](https://a.example.com/?y=1)')).toEqual([
      'https://a.example.com/?y=1',
      'https://a.example.com/?y=1',
    ]);
  });
});
