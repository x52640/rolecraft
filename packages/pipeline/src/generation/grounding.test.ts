import { describe, expect, it } from 'vitest';

import { extractLooseUrls, extractMultipliers, normalizeForGrounding } from './grounding.ts';

describe('extractLooseUrls', () => {
  it('finds bare domains, paths, url hosts and email domains', () => {
    expect(extractLooseUrls('見 github.com/x，或 https://Example.com/Demo。')).toEqual([
      'github.com/x',
      'example.com/Demo',
    ]);
    expect(extractLooseUrls('寄到 me@evil.com')).toEqual(['evil.com']);
  });

  it('sees through fullwidth and zero-width tricks', () => {
    expect(extractLooseUrls('ｅｖｉｌ．ｃｏｍ')).toEqual(['evil.com']);
    expect(extractLooseUrls('evil\u200B.\u2060com')).toEqual(['evil.com']);
  });

  it('ignores versions, plain numbers and common file names', () => {
    expect(extractLooseUrls('v1.2.3、3.14、README.md、Node.js、report.pdf、e.g.')).toEqual([]);
  });
});

describe('extractMultipliers', () => {
  it('normalizes case and separators', () => {
    expect(extractMultipliers('Doubled revenue, 10-fold, ten fold, 翻倍, in  half')).toEqual([
      'doubled',
      '10 fold',
      'ten fold',
      '翻倍',
      'in half',
    ]);
  });

  it('normalizes text with NFKC and strips zero-width characters', () => {
    expect(normalizeForGrounding('ｈｔｔｐｓ\u200B://a')).toBe('https://a');
  });
});

describe('normalizeForGrounding（對抗驗證補強）', () => {
  it('removes every format character and U+034F', () => {
    expect(normalizeForGrounding('a­b⁣c᠎d͏e\u{E0041}f​g')).toBe('abcdefg');
  });

  it('turns dot variants into "."', () => {
    expect(normalizeForGrounding('a。b｡c﹒d')).toBe('a.b.c.d');
    expect(normalizeForGrounding('a[.]b (.) c [dot] d (dot)e dot f')).toBe('a.b.c.d.e.f');
  });

  it('domains written with dot variants or hidden characters are extracted', () => {
    expect(extractLooseUrls('evil。com/x')).toEqual(['evil.com/x']);
    expect(extractLooseUrls('evil [dot] com')).toEqual(['evil.com']);
    expect(extractLooseUrls('ev­il.com')).toEqual(['evil.com']);
  });
});
