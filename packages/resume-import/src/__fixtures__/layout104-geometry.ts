/**
 * 測試用：照擁有者真實 104 PDF 量到的職稱／右欄日期座標合成的樣本（P1-T066 修正）。
 * 座標數值照實測（職稱 y=261／652／384／635、日期基線偏高 2.5／2／2／3pt、
 * 學歷日期 y=375 高於第一個職稱），文字全部虛構。
 */
import type { ExtractedPage, RawPage, TextRun } from '../types.ts';
import { page104, r } from './layout104.ts';

const HEAD = 11.7;
const BODY = 10.5;
const SMALL = 9.4;
const side = (x: number, text: string, y: number) => r(x, SMALL, text, { column: 1, y });

export function realGeometry104(): ExtractedPage[] {
  return [
    page104(1, [
      r(117, 14.1, '測試員\t虛構標語', { y: 800 }),
      r(117, SMALL, 'https://example.com/portfolio', { y: 770 }),
      r(23, BODY, '就業狀態\t在職中', { y: 740 }),
      r(23, HEAD, '學歷', { y: 420 }),
      r(23, BODY, '示範科技大學', { y: 400 }),
      r(23, SMALL, '資訊工程系 大學畢業', { y: 385 }),
      side(505, '2008/9~2012/6', 375),
      r(23, HEAD, '工作經驗', { y: 300 }),
      r(25, BODY, '總年資 10~15年工作經驗', { y: 285 }),
      r(68, HEAD, '資深專案經理', { y: 261 }),
      side(505, '2026/1~仍在職', 263.5),
      r(68, BODY, '甲範例股份有限公司（電腦系統整合服務業 100~500人）', { y: 247 }),
      r(68, SMALL, '專案管理 | 台北市', { y: 235 }),
      r(77, BODY, '• 帶領團隊導入新流程。', { y: 220 }),
    ]),
    page104(2, [
      r(68, HEAD, '專案經理', { y: 652 }),
      side(505, '2016/6~2025/12', 654),
      r(528, SMALL, '9年7個月', { y: 640 }),
      r(68, BODY, '乙範例有限公司（軟體及網路相關業 30~100人）', { y: 637 }),
      r(68, SMALL, '專案管理 | 新北市', { y: 625 }),
      r(77, BODY, '• 規劃產品。', { y: 610 }),
      r(68, HEAD, '產品專員', { y: 384 }),
      side(504, '2013/3~2016/5', 386),
      r(68, BODY, '丙範例有限公司（廣告行銷公關業 10~30人）', { y: 370 }),
      r(68, SMALL, '產品企劃 | 台中市', { y: 358 }),
      r(77, BODY, '• 撰寫需求文件。', { y: 343 }),
    ]),
    page104(3, [
      r(68, HEAD, '助理', { y: 635 }),
      side(504, '2012/7~2013/2', 638),
      r(68, BODY, '丁範例企業社（其他服務業 1~10人）', { y: 620 }),
      r(68, SMALL, '行政 | 高雄市', { y: 608 }),
      r(77, BODY, '• 行政支援。', { y: 593 }),
      r(23, HEAD, '專長', { y: 500 }),
      r(23, SMALL, '#專案管理 #C# #C#.NET #跨部門', { y: 485 }),
      r(23, SMALL, '溝通 #活動企劃 #F#', { y: 473 }),
      r(23, HEAD, '自傳', { y: 450 }),
      r(23, BODY, '我是一個虛構的測試人物。', { y: 435 }),
    ]),
  ];
}

const run = (text: string, x: number, y: number, height: number): TextRun => ({
  text,
  x,
  y,
  width: [...text].length * height,
  height,
  rotated: false,
});

/** 右欄字少（不到 3 段）的一頁：layoutPage 會退回單欄，職稱與日期併成一行。 */
export function mergedRowsRaw(): RawPage {
  return {
    pageNumber: 1,
    width: 595,
    height: 842,
    runs: [
      run('測試員', 117, 800, 14.1),
      run('學歷', 23, 760, HEAD),
      run('示範大學', 23, 745, BODY),
      run('工作經驗', 23, 720, HEAD),
      run('資深工程師', 68, 700, HEAD),
      run('2020/1~仍在職', 505, 701, SMALL),
      run('範例軟體有限公司（電腦軟體服務業 30~100人）', 68, 685, BODY),
      run('2年3個月', 528, 685, SMALL),
      run('軟體開發 | 台北市', 68, 673, SMALL),
      run('• 開發內部工具。', 77, 658, BODY),
      run('自傳', 23, 630, HEAD),
      run('虛構的自我介紹。', 23, 615, BODY),
    ],
  };
}
