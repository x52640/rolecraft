import { describe, expect, it } from 'vitest';

import { isAllowedOrigin, parseAllowedOrigins } from './origin.ts';

const A = `chrome-extension://${'a'.repeat(32)}/`;
const B = `chrome-extension://${'b'.repeat(32)}/`;

describe('origin', () => {
  it('解析逗號分隔清單', () => {
    expect(parseAllowedOrigins(` ${A},${B} `)).toEqual([A, B]);
  });

  it('沒設定＝空清單＝全部拒絕', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('  ')).toEqual([]);
    expect(isAllowedOrigin(A, [])).toBe(false);
  });

  it('清單內有任何格式不符的項目就整份拒絕（fail closed）', () => {
    expect(() => parseAllowedOrigins(`${A},chrome-extension://*/`)).toThrow();
    expect(() => parseAllowedOrigins(`${A},`)).toThrow();
    expect(() => parseAllowedOrigins('https://evil.example/')).toThrow();
  });

  it.each([
    [B, '格式正確但不在清單'],
    [A.slice(0, -1), '少結尾斜線'],
    [`${A}x`, '多字元'],
    [A.toUpperCase(), '大寫'],
    ['https://www.104.com.tw/', '網頁 origin'],
    [`chrome-extension://${'z'.repeat(32)}/`, '非 a–p 字元'],
    [undefined, '沒傳'],
    ['', '空字串'],
  ])('拒絕 %s（%s）', (origin, why) => {
    expect(isAllowedOrigin(origin, [A]), why).toBe(false);
  });

  it('逐字相符才放行', () => {
    expect(isAllowedOrigin(A, [A])).toBe(true);
  });
});
