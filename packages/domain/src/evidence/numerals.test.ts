import { describe, expect, it } from 'vitest';

import { extractNumbers, numberKeys } from './numbers.ts';

const keys = (text: string): string[] => [...numberKeys(text)].sort();

describe('「參」只在數字前後文才算 3', () => {
  it.each(['參考文件', '參與搜尋功能', '參加黑客松', '參觀工廠', '參數調校', '參閱規格'])(
    '%s 不含數字',
    (text) => {
      expect(extractNumbers(text)).toEqual([]);
    },
  );

  it.each([
    ['參萬人', ['#30000']],
    ['參佰件', ['#300']],
    ['參拾人', ['#30']],
    ['參個專案', ['#3']],
    ['參 個專案', ['#3']],
    ['參年經驗', ['#3']],
    ['壹萬參仟', ['#13000']],
    ['第參名', ['#3']],
    ['參點五倍', ['#3.5']],
    ['三成參', ['%33']],
    ['提升百分之參十', ['%30']],
  ])('%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it('百分之參：無法辨識，當成擋下', () => {
    expect(extractNumbers('提升百分之參').some((t) => t.key === null)).toBe(true);
  });
});
