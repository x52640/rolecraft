import { describe, expect, it } from 'vitest';

import { extractNumbers, numberKeys } from './numbers.ts';

const keys = (text: string): string[] => [...numberKeys(text)].sort();

describe('extractNumbers', () => {
  it.each([
    ['提升 30%', ['%30']],
    ['提升 30 %', ['%30']],
    ['提升３０％', ['%30']],
    ['提升百分之三十', ['%30']],
    ['提升 30 percent', ['%30']],
    ['提升 thirty percent', ['%30']],
    ['5‰ 錯誤率', ['%0.5']],
    ['服務 1,000 人', ['#1000']],
    ['服務 １，０００ 人', ['#1000']],
    ['服務一千人', ['#1000']],
    ['服務壹仟人', ['#1000']],
    ['服務 1k 人', ['#1000']],
    ['服務 1K users', ['#1000']],
    ['3萬名使用者', ['#30000']],
    ['三萬名使用者', ['#30000']],
    ['1.5億元', ['#150000000']],
    ['一萬五千人', ['#15000']],
    ['一萬五人', ['#15000']],
    ['一百零五人', ['#105']],
    ['二十五人', ['#25']],
    ['三點五萬', ['#35000']],
    ['二〇二三年', ['#2023']],
    ['2023年', ['#2023']],
    ['two thousand users', ['#2000']],
    ['兩百萬', ['#2000000']],
    ['百萬用戶', ['#1000000']],
    ['數萬名用戶', ['#10000']],
    ['十人團隊', ['#10']],
    ['三人團隊', ['#3']],
  ])('%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it('寫法不同但數值相同的 key 相同', () => {
    const variants = [
      '10000',
      '10,000',
      '１００００',
      '1萬',
      '一萬',
      '壹萬',
      '10k',
      'ten thousand',
    ];
    for (const v of variants) expect(keys(`服務 ${v} 人`)).toEqual(['#10000']);
  });

  it('百分比與一般數字是不同的 key', () => {
    expect(keys('30%')).not.toEqual(keys('30 人'));
  });

  it('去掉零寬字元與組合符號後才擷取（防止插字繞過）', () => {
    expect(keys('提升 3​0%')).toEqual(['%30']);
    expect(keys('提升 3‍0️%')).toEqual(['%30']);
    expect(keys('提升 3­0%')).toEqual(['%30']);
  });

  it('數字旁的形似字母（O、l）當成數字', () => {
    expect(keys('服務 1O,OOO 人')).toEqual(['#10000']);
    expect(keys('服務 l0000 人')).toEqual(['#10000']);
  });

  it('其他文字系統的數字無法解析，key 為 null', () => {
    const tokens = extractNumbers('服務 ٣٠ 人');
    expect(tokens.some((t) => t.key === null)).toBe(true);
  });

  it('常見非數量用語不算數字', () => {
    expect(keys('統一管理、唯一負責人、第一個版本、one of the team')).toEqual([]);
    expect(keys('十分重要')).toEqual([]);
  });

  it('單一「一」接數量詞時算數字', () => {
    expect(keys('一人完成')).toEqual(['#1']);
  });
});
