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

describe('groundingProblem（P1-T047 對抗驗證）', () => {
  const job = { company: 'LINE', title: 'Backend Engineer' };
  const cite = (text: string, type: 'link' | 'personal_role' = 'link') => [
    claim('c1', { type, text, completionStatus: null }),
  ];

  it('捏造的 IPv6 網址會被擋（含全形方括號）', () => {
    for (const text of [
      '入口 http://[abcd::ef]/admin',
      'https://[::ffff:abcd:ef]',
      'http://［abcd::ef］/x',
    ]) {
      expect(groundingProblem(text, cite('https://github.com/me'), job)).toBe('link_not_in_claims');
    }
    expect(
      groundingProblem('入口 http://[abcd::ef]/admin', cite('http://[abcd::ef]/admin'), job),
    ).toBeNull();
  });

  it('職缺名稱的英文字尾、連字號與公司法人字樣都算提到', () => {
    for (const text of [
      '身為 Backend Engineers 之一',
      '曾在 LINEs 團隊',
      "LINE's 團隊",
      'Backend Engineering',
      '擔任 Backend-Engineer',
      '在 L-I-N-E',
      '在 L_I_N_E',
      '在 L.I.N.E',
    ]) {
      expect(groundingProblem(text, cite('登入', 'personal_role'), job)).toBe(
        'mentions_job_identity',
      );
    }
    expect(
      groundingProblem('建置 pipeline 與 online 服務', cite('登入', 'personal_role'), job),
    ).toBeNull();
    const corp = { company: 'Line Corp', title: 'x' };
    expect(groundingProblem('在 LINE Corporation', cite('登入', 'personal_role'), corp)).toBe(
      'mentions_job_identity',
    );
    expect(
      groundingProblem('降低 cost', cite('登入', 'personal_role'), {
        company: 'Costco',
        title: 'x',
      }),
    ).toBeNull();
  });

  it('寬鬆網域：全形標點當分隔，但全形括號點仍算網域', () => {
    const source = cite('作品集網址 https://a.com/x');
    for (const text of [
      '網站 https://a.com/x（已上線）',
      '網站 https://a.com/x，Next.js 開發',
      '網站 https://a.com/x；React',
      '網站 https://a.com/x［demo］',
    ]) {
      expect(groundingProblem(text, source, job)).toBeNull();
    }
    for (const text of ['請看 evil［.］com', '請看 evil（．）com', '請看 evil ［dot］ com']) {
      expect(groundingProblem(text, source, job)).toBe('link_not_in_claims');
    }
  });

  it('Markdown 連結的方括號不黏進寬鬆網址', () => {
    const plain = cite('作品集 https://a.com/x');
    for (const text of ['[https://a.com/x](https://a.com/x)', '[a.com/x](https://a.com/x)']) {
      expect(groundingProblem(text, plain, job)).toBeNull();
    }
    expect(
      groundingProblem('作品集 https://a.com/x', cite('[https://a.com/x](https://a.com/x)'), job),
    ).toBeNull();
  });
});

describe('groundingProblem（P1-T056）', () => {
  const job = { company: 'LINE', title: 'Backend Engineer' };
  const cite = (text: string) => [claim('c1', { type: 'link', text, completionStatus: null })];

  it('網址查詢參數的方括號不截斷：捏造的參數值會被擋', () => {
    const source = cite('後台 https://a.com/x?filter[role]=user');
    expect(groundingProblem('後台 https://a.com/x?filter[role]=admin', source, job)).toBe(
      'link_not_in_claims',
    );
    expect(groundingProblem('後台 https://a.com/x?filter[role]=user', source, job)).toBeNull();
    for (const text of [
      '後台 https://a.com/x?filter［role］=admin',
      '後台 https://a.com/x?filter［role］=user［2］&x=1',
      '後台 https://a.com/x?filter\u200B[role]=admin',
    ]) {
      expect(groundingProblem(text, source, job)).toBe('link_not_in_claims');
    }
    expect(groundingProblem('後台 https://a.com/x?filter［role］=user。', source, job)).toBeNull();
  });

  it('寬鬆網址查詢參數的方括號不截斷', () => {
    expect(extractLooseUrls('a.com/x?filter[user]=attacker')).toEqual([
      'a.com/x?filter[user]=attacker',
    ]);
    const source = cite('見 a.com/x?filter[user]=owner');
    expect(groundingProblem('見 a.com/x?filter[user]=attacker', source, job)).toBe(
      'link_not_in_claims',
    );
    expect(groundingProblem('見 a.com/x?filter[user]=owner', source, job)).toBeNull();
    const plain = cite('https://a.com/x?f=1');
    expect(groundingProblem('[a.com/x?f=1](https://a.com/x?f=1)', plain, job)).toBeNull();
  });

  it('方括號點中間夾零寬字元仍算網域', () => {
    for (const text of ['請看 evil［​.］com', '請看 evil[​.⁠]com', '請看 evil（．​）com']) {
      expect(extractLooseUrls(text)).toEqual(['evil.com']);
    }
  });
});
