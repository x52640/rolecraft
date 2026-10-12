/**
 * 測試用：合成、去識別化的 104 履歷版面（P1-T066）。座標與字高照 104 版面特徵：
 * 段落標題 x≈23 字高 11.7、經歷職稱 x≈68 字高 11.7、右欄日期 x≈505 字高 9.4、
 * 公司 x≈68 字高 10.5、職務類別與 #標籤 字高 9.4、條列 x≈77、續行 x≈84。
 * 內容全是虛構，不含任何真實姓名、電話、email、地址、公司名。
 */
import type { ExtractedPage, TextLine } from '../types.ts';

export interface Row {
  text: string;
  x: number;
  h: number;
  column?: number;
  /** 與上一行的基線距離（預設 15）；負值表示比上一行高 */
  dy?: number;
}

export const r = (x: number, h: number, text: string, extra: Partial<Row> = {}): Row => ({
  text,
  x,
  h,
  ...extra,
});

/**
 * rows 依版面由上到下給座標；order 決定 lines 陣列的閱讀順序（預設同 rows），
 * 用來模擬 layoutPage 把右欄行排在同段左欄之後。
 */
export function page104(pageNumber: number, rows: Row[], order?: number[]): ExtractedPage {
  let y = 800;
  const placed: TextLine[] = rows.map((row, i) => {
    if (i > 0) y -= row.dy ?? 15;
    return {
      pageNumber,
      column: row.column ?? 0,
      text: row.text,
      x: row.x,
      y,
      width: 100,
      height: row.h,
    };
  });
  const lines = (order ?? placed.map((_, i) => i)).map((i) => placed[i] as TextLine);
  return { pageNumber, width: 595, height: 842, columns: 2, lines };
}

const BODY = 10.5;
const SMALL = 9.4;
const HEAD = 11.7;

/** 第 1 頁：頁首、個人資料、學歷、工作經驗第一段（仍在職）。 */
export const PAGE1_ROWS: Row[] = [
  r(117, 14.1, '林測試\t熱愛解決問題的產品人\t台北市\t可面試'),
  r(117, BODY, '範例科技有限公司 | 產品經理'),
  r(117, BODY, '示範大學 | 資訊管理學系 大學畢業'),
  r(117, SMALL, '個人網站：https://example.com/me'),
  r(23, BODY, '個人資料\t男 、 30歲 、 役畢'),
  r(23, BODY, '就業狀態\t在職中'),
  r(23, BODY, '主要手機\t0900-000-000'),
  r(23, BODY, 'E-mail\tsample@example.com'),
  r(23, BODY, '通訊地址\t虛構市測試區範例路一段'),
  r(84, BODY, '100號***'),
  r(23, HEAD, '學歷'),
  r(23, BODY, '示範大學'),
  r(23, SMALL, '資訊管理學系 大學畢業'),
  r(23, HEAD, '工作經驗'),
  r(25, BODY, '總年資 5~6年工作經驗'),
  r(68, HEAD, '資深產品經理'),
  // 右欄日期基線比職稱略高 1pt，閱讀順序卻排在段尾（見 PAGE1_ORDER）。
  r(509, SMALL, '2019/3~2020/12', { column: 1, dy: -1 }),
  r(505, SMALL, '2021/1~仍在職', { column: 1, dy: 12 }),
  r(68, BODY, '範例科技有限公司（電腦軟體服務業 30~100人）', { dy: 4 }),
  r(68, SMALL, '產品企劃 | 台北市'),
  r(68, BODY, '核心職責'),
  r(77, BODY, '• 規劃訂閱產品路線圖：協調 design 與 engineering 團隊，'),
  r(84, BODY, '縮短上線時程。'),
  r(77, BODY, '• 建立 A/B testing'),
  r(84, BODY, 'framework 與指標儀表板。'),
  r(68, BODY, '主要成果'),
];
/** 右欄兩行（索引 16、17）排在最後，模擬雙欄閱讀順序。 */
export const PAGE1_ORDER = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 16, 17,
];

/** 第 2 頁：第一段描述延續、#標籤，第二段（年資被分到 column 0、x 很大）。 */
export const PAGE2_ROWS: Row[] = [
  r(77, BODY, '• 轉換率提升 20%，續約率提升 8%。'),
  r(68, SMALL, '#產品管理 #數據分析 #User Research'),
  r(68, HEAD, '產品企劃專員'),
  r(504, SMALL, '2016/7~2018/12', { column: 1, dy: 0 }),
  r(528, SMALL, '2年6個月', { dy: 12 }),
  r(68, BODY, '虛構電商股份有限公司（Demo Labs)（網際網路相關業 100~500人）', { dy: 3 }),
  r(68, SMALL, '產品企劃 | 新北市'),
  r(68, BODY, '負責會員系統與活動頁企劃。'),
  r(68, BODY, '會員專案 | 2017/01 – 2018/06'),
  r(68, BODY, '管理人數： 3 人'),
  r(77, BODY, '• 導入會員分級，回購率提升 15%。'),
  r(68, SMALL, '#產品管理 #活動企劃 #跨部門'),
  r(68, SMALL, '溝通'),
];

/** 第 3 頁：第三段（年資與圖示合成一行）、求職條件、語言能力、專長。 */
export const PAGE3_ROWS: Row[] = [
  r(68, HEAD, '行銷助理'),
  r(504, SMALL, '2015/2~2016/6', { column: 1, dy: 0 }),
  r(33, 14.1, '★\t1年5個月', { dy: 12 }),
  r(68, BODY, '測試行銷顧問（廣告行銷公關業 10~30人）', { dy: 3 }),
  r(68, SMALL, '行銷助理 | 台中市'),
  r(77, BODY, '• 社群經營與素材製作。'),
  r(23, HEAD, '求職條件'),
  r(23, BODY, '希望性質 全職工作'),
  r(23, HEAD, '語言能力'),
  r(23, BODY, '英文'),
  r(23, SMALL, '聽/中等 說/中等 讀/中等 寫/中等'),
  r(23, HEAD, '專長'),
  r(23, BODY, '產品規劃'),
  r(23, BODY, '從需求訪談到上線追蹤的完整流程。'),
  r(23, SMALL, '#Product Roadmap #SQL #產品管理'),
  r(23, HEAD, '自傳'),
  r(23, BODY, '我是一個虛構的測試人物。'),
];

export function sample104(): ExtractedPage[] {
  return [page104(1, PAGE1_ROWS, PAGE1_ORDER), page104(2, PAGE2_ROWS), page104(3, PAGE3_ROWS)];
}
