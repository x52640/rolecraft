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
