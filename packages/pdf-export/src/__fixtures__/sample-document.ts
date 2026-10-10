/**
 * 測試與樣本用的虛構履歷（不含真實個資）。刻意放進：
 * - ADR-0005 康熙部首回測字：小、一、人、大、入、口、日、山、工、心、手、文
 * - spike 曾錯碼位的標點：– （U+2013）、／（U+FF0F）、・
 * - 全形標點、中英混排、數字、網址、mailto、罕用人名字（堃、喆、犇）
 */
import type { ResumeDocument } from '../model.ts';

export const SAMPLE_DOCUMENT: ResumeDocument = {
  name: '林小堃',
  headline: '資深後端工程師／大型交易系統',
  contacts: [
    { text: '0912-345-678' },
    { text: 'xiaokun.lin@example.com', href: 'mailto:xiaokun.lin@example.com' },
    { text: 'github.com/example-kun', href: 'https://github.com/example-kun' },
    { text: '臺北市' },
  ],
  sections: [
    {
      heading: '自我介紹',
      items: [
        {
          kind: 'paragraph',
          text: '八年後端開發經驗，專長是把大型單體系統拆小、讓一個人也能看懂的架構。重視可觀測性與文件，習慣先寫測試再動手；曾帶領 5 人小組，從入口流量到資料庫調校都親自參與。',
        },
      ],
    },
    {
      heading: '工作經歷',
      items: [
        { kind: 'entry', title: '星河數位股份有限公司｜資深後端工程師', meta: '2021/03 – 至今' },
        {
          kind: 'bullet',
          text: '主導訂單系統由單體架構拆分為 12 個服務，尖峰每秒處理 3,200 筆請求，P99 延遲從 850ms 降到 210ms。',
        },
        {
          kind: 'bullet',
          text: '設計以事件為核心的對帳流程（Kafka＋PostgreSQL），每日自動核對約 48 萬筆交易，人工對帳時數減少 90%。',
        },
        {
          kind: 'bullet',
          text: '帶領 5 人小組導入程式碼審查與自動化測試，單元測試覆蓋率由 31% 提升到 78%。',
        },
        { kind: 'entry', title: '堃喆科技有限公司｜後端工程師', meta: '2018/07 – 2021/02' },
        {
          kind: 'bullet',
          text: '維護會員與點數系統（Node.js、TypeScript、MySQL），服務約 120 萬名會員；月活躍人數成長一倍。',
        },
        {
          kind: 'bullet',
          text: '重寫點數到期批次作業，執行時間由 6 小時縮短到 25 分鐘，並加上可重跑與斷點續跑。',
        },
        { kind: 'entry', title: '犇馳物流｜軟體工程實習生', meta: '2017/07 – 2017/08' },
        {
          kind: 'bullet',
          text: '以 Python 撰寫路線排程原型，比較三種演算法在 200 個配送點下的總里程差異。',
        },
      ],
    },
    {
      heading: '專案',
      items: [
        { kind: 'entry', title: '開源專案：TaiwanAddressParser' },
        {
          kind: 'bullet',
          text: '把臺灣地址拆成縣市、鄉鎮市區、路段、巷弄、號、樓層；支援「臺／台」異體字與全形數字。',
        },
        {
          kind: 'link',
          link: {
            text: 'https://github.com/example-kun/taiwan-address-parser',
            href: 'https://github.com/example-kun/taiwan-address-parser',
          },
        },
      ],
    },
    {
      heading: '技能',
      items: [
        {
          kind: 'paragraph',
          text: '工具：TypeScript・Node.js・Go・PostgreSQL・Kafka・Kubernetes。語言：中文（母語）、英文（工作流利）、日文（日常會話）。週末在山上當志工，手作木工。',
        },
      ],
    },
    {
      heading: '學歷',
      items: [{ kind: 'entry', title: '國立臺灣大學｜資訊工程學系 學士', meta: '2013 – 2017' }],
    },
  ],
};
