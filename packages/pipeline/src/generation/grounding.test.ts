import { describe, expect, it } from 'vitest';

import { claim } from './fixtures.test-helpers.ts';
import {
  extractLooseUrls,
  extractMultipliers,
  groundingProblem,
  normalizeForGrounding,
  normalizeLooseDots,
} from './grounding.ts';

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

  it('turns dot variants into "." only in the loose view', () => {
    expect(normalizeLooseDots('a。b｡c﹒d')).toBe('a.b.c.d');
    expect(normalizeLooseDots('a[.]b (.) c [dot] d (dot)e dot f')).toBe('a.b.c.d.e.f');
    expect(normalizeForGrounding('3。14 [dot] x')).toBe('3。14 [dot] x');
  });

  it('domains written with dot variants or hidden characters are extracted', () => {
    expect(extractLooseUrls('evil。com/x')).toEqual(['evil.com/x']);
    expect(extractLooseUrls('evil [dot] com')).toEqual(['evil.com']);
    expect(extractLooseUrls('ev­il.com')).toEqual(['evil.com']);
  });
});

describe('groundingProblem（P1-T047 回歸）', () => {
  const job = { company: 'LINE', title: 'Staff Engineer' };
  const cite = (text: string) => [
    claim('c1', { type: 'outcome_metric', text, completionStatus: null }),
  ];

  it('中文句號不會把「3。14 位」變成 3.14', () => {
    expect(groundingProblem('平均評分為 3.14', cite('平均評分為 3。14 位成員'), job)).toBe(
      'number_not_in_claims',
    );
    expect(groundingProblem('平均評分為 3', cite('平均評分為 3。14 位成員'), job)).toBeNull();
  });

  it('全形逗號不會黏進完整網址', () => {
    const source = cite('https://example.com/demo，支援登入');
    expect(groundingProblem('作品 https://example.com/demo 支援登入', source, job)).toBeNull();
    expect(groundingProblem('作品 https://example.com/demo2 支援登入', source, job)).toBe(
      'link_not_in_claims',
    );
  });

  it('寬鬆網域仍看穿句點變體', () => {
    for (const text of ['請看 evil。com', '請看 evil [dot] com', '請看 evil［.］com']) {
      expect(groundingProblem(text, cite('登入'), job)).toBe('link_not_in_claims');
    }
  });

  it('拉丁字母公司名要字詞邊界；中文名稱維持子字串', () => {
    expect(groundingProblem('建置 data pipeline 與 online 服務', cite('登入'), job)).toBeNull();
    for (const text of [
      '在 LINE 負責',
      'at LINE now',
      'L I N E 團隊',
      '加入LINE團隊',
      'line，inc',
    ]) {
      expect(groundingProblem(text, cite('登入'), job)).toBe('mentions_job_identity');
    }
    expect(groundingProblem('as a staff  engineer', cite('登入'), job)).toBe(
      'mentions_job_identity',
    );
    const cn = { company: '乙公司', title: '前端工程師' };
    expect(groundingProblem('在甲乙公司服務', cite('登入'), cn)).toBe('mentions_job_identity');
    expect(groundingProblem('擔任資深前端 工程師', cite('登入'), cn)).toBe('mentions_job_identity');
  });
});
