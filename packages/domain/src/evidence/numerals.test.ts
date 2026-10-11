import { describe, expect, it } from 'vitest';

import { extractNumbers, numberKeys } from './numbers.ts';

const keys = (text: string): string[] => [...numberKeys(text)].sort();

describe('「參」只在一般詞裡不算 3', () => {
  it.each([
    '參考文件',
    '參與搜尋功能',
    '參加黑客松',
    '參觀工廠',
    '參數調校',
    '參閱規格',
    '毀譽參半',
    '人參',
    '參團旅遊',
    '海參',
    '參照規範',
    '參賽作品',
    '參選',
    '參展',
  ])('%s 不含數字', (text) => {
    expect(extractNumbers(text)).toEqual([]);
  });

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

  it('百分之參：反向判斷後「參」算 3，是 3%（P1-T056）', () => {
    expect(keys('提升百分之參')).toEqual(['%3']);
  });
});

describe('「參」的前後文補齊百分比後綴與量詞（P1-T056）', () => {
  it.each([
    ['改善參‰', ['%0.3']],
    ['改善參‱', ['%0.03']],
    ['提升參%', ['%3']],
    ['提升參 percent', ['%3']],
    ['提升參百分點', ['pt3']],
    ['處理參批資料', ['#3']],
    ['帶領參組人', ['#3']],
    ['參輪面試', ['#3']],
    ['參多人', []],
  ])('%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it('參多人：約數，無法辨識', () => {
    expect(extractNumbers('參多人').some((t) => t.key === null)).toBe(true);
  });

  it('百分之參十：只有一個 30% token，沒有多出無法辨識的「百分之」', () => {
    expect(extractNumbers('提升百分之參十').map((t) => t.key)).toEqual(['%30']);
  });

  it('百分之後接其他數字寫法也不多出 null token', () => {
    for (const text of ['百分之三十', '百分之 30', '百分之thirty', '百分之 參拾']) {
      expect(extractNumbers(text).some((t) => t.key === null)).toBe(false);
    }
  });
});

describe('「參」反向判斷：預設算 3（P1-T056 對抗驗證）', () => {
  it.each([
    ['提升參 pp', ['#3']],
    ['參 bps', ['#3']],
    ['參×', ['#3']],
    ['參小時', ['#3']],
    ['參美元', ['#3']],
    ['參公里', ['#3']],
    ['參毫秒', ['#3']],
    ['參所大學', ['#3']],
    ['參國', ['#3']],
  ])('%s 抽得到數字', (text, expected) => {
    expect(extractNumbers(text).length).toBeGreaterThan(0);
    expect(keys(text).every((k) => expected.includes(k))).toBe(true);
  });

  it('參 k 用戶：抽得到（不會被當成沒有數字放行）', () => {
    expect(extractNumbers('參 k 用戶').length).toBeGreaterThan(0);
  });
});
