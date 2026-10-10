/** 對抗驗證回歸：數字擷取改為 fail closed（看起來像數量但解析不了 → key=null）。 */
import { describe, expect, it } from 'vitest';

import { NUMBER_EXCLUSIONS } from './number-exclusions.ts';
import { extractNumbers, numberKeys } from './numbers.ts';

const keys = (text: string): (string | null)[] => extractNumbers(text).map((t) => t.key);

describe('單一中文數字字預設算數字', () => {
  it.each([
    ['管理十個專案', ['#10']],
    ['十年以上工作經驗', ['#10']],
    ['千台伺服器', ['#1000']],
    ['導入十項流程', ['#10']],
    ['卌人', ['#40']],
    ['營收 3兆', ['#3000000000000']],
    ['上一版', ['#1']],
  ])('%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });
});

describe('約數 → key=null', () => {
  it.each([
    '服務百餘家企業',
    '十多位工程師',
    '十幾人',
    '數萬名用戶',
    '數十人',
    '上千位使用者',
    '三五個',
    '兩三天',
    '十二三人',
    '100多人',
    '100+ users',
    '提升 30%+',
    'thousands of users',
    'hundreds of clients',
    'millions of requests',
    'tens of thousands of users',
    'a dozen clients',
    'dozens of services',
    '數個百分點',
  ])('%s', (text) => {
    const found = keys(text);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((k) => k === null)).toBe(true);
  });

  it('有數字修飾的英文量級詞照常換算', () => {
    expect(keys('two dozen')).toEqual(['#24']);
    expect(keys('a thousand users')).toEqual(['#1000']);
    expect(keys('5 million users')).toEqual(['#5000000']);
  });
});

describe('單位後綴', () => {
  it.each([
    ['營收 5bn', ['#5000000000']],
    ['月活 5mn', ['#5000000']],
    ['月活 5w', ['#50000']],
    ['5 M users', ['#5000000']],
    ['提升 3x', ['#3']],
    ['1e6 次請求', ['#1000000']],
  ])('已知後綴換算：%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it.each(['延遲 100ms', '5GB 記憶體', '5kg', '10^6 次'])('未知後綴或寫法 → null：%s', (text) => {
    expect(keys(text)).toEqual([null]);
  });
});

describe('成與百分點', () => {
  it.each([
    ['提升三成', ['%30']],
    ['提升 3成', ['%30']],
    ['提升三成五', ['%35']],
    ['九成以上', ['%90']],
  ])('成換算百分比：%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it('三成與 30% 相同、與 3 不同', () => {
    expect([...numberKeys('三成')]).toEqual([...numberKeys('30%')]);
    expect([...numberKeys('三成')]).not.toEqual([...numberKeys('3 人')]);
  });

  it.each([
    ['5 個百分點', ['pt5']],
    ['五個百分點', ['pt5']],
    ['30 percentage points', ['pt30']],
  ])('百分點獨立一類：%s', (text, expected) => {
    expect(keys(text)).toEqual(expected);
  });

  it('百分點不能對上一般數字或百分比', () => {
    const pt = [...numberKeys('5 個百分點')];
    expect(pt).not.toEqual([...numberKeys('5 人')]);
    expect(pt).not.toEqual([...numberKeys('5%')]);
  });

  it('百分之、百分百', () => {
    expect(extractNumbers('百分之三十')).toEqual([{ text: '百分之三十', key: '%30' }]);
    expect(keys('百分百達成')).toEqual(['%100']);
  });
});

describe('形似字母、其他百分號、其他數字字元', () => {
  it.each(['IOO% 覆蓋率', 'ЗО% 轉換率', 'XII 倍', 'Ⅻ 倍', '½ 的成本', '10²', '①完成'])(
    '無法辨識：%s',
    (text) => {
      expect(keys(text)).toContain(null);
    },
  );

  it.each(['提升 30٪', '提升 30﹪', '提升 30％', '提升 3О%'])('百分號變體：%s', (text) => {
    expect(keys(text)).toEqual(['%30']);
  });
});

describe('切碎與合併', () => {
  it.each(['1萬5 用戶', '3千5百', '三萬5000', '1.000 users', '1.000.000', '10 000 users'])(
    '分不清的組合 → 單一 null：%s',
    (text) => {
      expect(keys(text)).toEqual([null]);
    },
  );

  it.each(['115F', '1160', '3164', 'FFA0', '200B', '2060', 'FE0F'])(
    '不可見字元 U+%s 夾在數字中間 → 合併',
    (ch) => {
      const invisible = String.fromCodePoint(Number.parseInt(ch, 16));
      expect(keys(`提升 1${invisible}5%`)).toEqual(['%15']);
    },
  );
});

describe('識別字與版本號整串字面比對', () => {
  it.each([
    ['K8s', 'id:k8s'],
    ['AWS EC2', 'id:ec2'],
    ['Vue3', 'id:vue3'],
    ['H.264', 'id:h.264'],
    ['Go1.21', 'id:go1.21'],
    ['v1.2.3', 'id:v1.2.3'],
  ])('%s', (text, key) => {
    expect(keys(text)).toEqual([key]);
  });

  it('解析度的 x 是乘號', () => {
    expect(keys('1920x1080')).toEqual(['#1920', '#1080']);
  });
});

describe('排除表：常見非數量詞不擋', () => {
  it.each(['零售業', '第三方登入', '萬一失敗', '千萬不要', 'Three.js', '一成不變'])(
    '%s',
    (text) => {
      expect(keys(text)).toEqual([]);
    },
  );

  it('數字片段比排除詞長就照算', () => {
    expect(keys('第三百名')).toEqual(['#300']);
    expect(keys('營收三千萬')).toEqual(['#30000000']);
    expect(keys('十一個模組')).toEqual(['#11']);
  });

  it('每個排除詞都附理由', () => {
    for (const e of NUMBER_EXCLUSIONS) expect(e.reason).not.toBe('');
  });
});

describe('正常技術履歷句子不產生數字', () => {
  it.each([
    '負責後端 API 設計與實作，導入 CI/CD 流程',
    '使用 React 與 TypeScript 重構前端架構，提升開發效率',
    '與產品、設計團隊協作，定義需求並排定優先順序',
    '建立一套自動化測試流程，降低回歸錯誤',
    '主導資料庫遷移，確保服務不中斷',
    '設計一個可擴展的訊息佇列架構，統一各服務的事件格式',
    '負責第三方金流串接與對帳流程',
    '進一步優化查詢效能，並撰寫技術文件',
    '帶領團隊一起完成零售業客戶的電商平台',
    '維護既有系統，一直以來負責線上問題排查',
    '擔任專案的唯一後端工程師，一手打造推薦引擎',
    '熟悉 Three.js 與 WebGL，萬一服務異常可以第一時間回應',
    'Led the migration to a microservices architecture and mentored junior engineers',
    'Designed one of the core payment services',
  ])('%s', (text) => {
    expect(extractNumbers(text)).toEqual([]);
  });
});
