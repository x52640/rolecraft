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
});
