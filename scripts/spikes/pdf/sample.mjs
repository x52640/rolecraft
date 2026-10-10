// P1-T026 spike：樣本履歷內容（虛構人物，不含真實個資）。
// 刻意放進：全形標點、中英混排、數字日期、網址、較少見的人名用字（堃、喆、犇）、
// 長段落（測換行）、足夠多的段落（測跨頁）。

/** @typedef {{ kind: 'title' | 'heading' | 'meta' | 'para' | 'bullet', text: string }} Block */

const experiences = [
  {
    head: '資深後端工程師｜星河數位股份有限公司｜2021/03 – 至今',
    bullets: [
      '主導訂單系統由單體架構拆分為 12 個服務，尖峰每秒處理 3,200 筆請求，P99 延遲從 850ms 降到 210ms。',
      '設計以事件為核心的對帳流程（Kafka＋PostgreSQL），每日自動核對約 48 萬筆交易，人工對帳時數減少 90%。',
      '帶領 5 人小組導入程式碼審查與自動化測試，單元測試覆蓋率由 31% 提升到 78%。',
      '與產品、客服協作「退款自助化」專案：上線三個月客服來電量下降 27%。',
    ],
  },
  {
    head: '後端工程師｜堃喆科技有限公司｜2018/07 – 2021/02',
    bullets: [
      '維護會員與點數系統（Node.js、TypeScript、MySQL），服務約 120 萬名會員。',
      '重寫點數到期批次作業，執行時間由 6 小時縮短到 25 分鐘，並加上可重跑與斷點續跑。',
      '建立 API 文件與錯誤碼規範，對外合作夥伴串接時間由平均 3 週縮短為 1 週。',
    ],
  },
  {
    head: '軟體工程實習生｜犇馳物流｜2017/07 – 2017/08',
    bullets: ['以 Python 撰寫路線排程原型，比較三種演算法在 200 個配送點下的總里程差異。'],
  },
];

const projects = [
  {
    head: '開源專案：TaiwanAddressParser（GitHub 1.2k ★）',
    bullets: [
      '把臺灣地址拆成縣市、鄉鎮市區、路段、巷弄、號、樓層；支援「臺／台」異體字與全形數字。',
      '網址：https://github.com/example/taiwan-address-parser',
    ],
  },
  {
    head: '社群講者：COSCUP 2024「訂單系統拆分的十個坑」',
    bullets: ['分享拆分順序、資料一致性與回滾策略；投影片與錄影公開於社群網站。'],
  },
];

const longPara =
  '我是一位專注於後端系統與資料一致性的工程師，過去七年在電商與會員服務領域累積經驗。' +
  '擅長把模糊的業務需求拆成可驗證的小步驟，先量測再優化；重視可維運性，' +
  '習慣在上線前準備監控指標、告警門檻與回滾方案。希望下一份工作能在重視工程品質的團隊中，' +
  '負責核心交易系統的設計與演進，並協助團隊建立穩定的開發流程（code review、CI/CD、事故檢討）。';

/** @returns {Block[]} */
export function buildSample() {
  /** @type {Block[]} */
  const blocks = [
    { kind: 'title', text: '王小明　Wang Hsiao-Ming' },
    { kind: 'meta', text: 'Email：hsiaoming.wang@example.com｜電話：0912-345-678｜臺北市' },
    { kind: 'heading', text: '自我介紹' },
    { kind: 'para', text: longPara },
    { kind: 'heading', text: '工作經歷' },
  ];
  // 經歷重複兩輪，確保內容超過一頁，可測跨頁與分頁控制。
  for (const round of [1, 2]) {
    for (const exp of experiences) {
      blocks.push({ kind: 'meta', text: round === 1 ? exp.head : `${exp.head}（續）` });
      for (const b of exp.bullets) blocks.push({ kind: 'bullet', text: b });
    }
  }
  blocks.push({ kind: 'heading', text: '專案與社群' });
  for (const p of projects) {
    blocks.push({ kind: 'meta', text: p.head });
    for (const b of p.bullets) blocks.push({ kind: 'bullet', text: b });
  }
  blocks.push({ kind: 'heading', text: '技能' });
  blocks.push({
    kind: 'para',
    text: 'TypeScript、Node.js、Go、PostgreSQL、MySQL、Redis、Kafka、Docker、Kubernetes、AWS（EC2、RDS、S3）、OpenTelemetry。',
  });
  blocks.push({ kind: 'heading', text: '學歷' });
  blocks.push({ kind: 'meta', text: '國立臺灣科技大學 資訊工程系 學士｜2014 – 2018' });
  return blocks;
}

/**
 * 字型涵蓋率探針：這些字不放進樣本內文，只檢查字型有沒有字形。
 * 用來說明「缺字偵測」真的會抓到東西，而不是永遠回報 0。
 */
export const COVERAGE_PROBE = [
  '堃喆犇淼鑫焱垚', // 常見人名用字
  '峯裏綫着', // 異體／港式用字
  '𠮷𡘙', // CJK 擴充 B（多數子集字型沒有）
  '①②③※→✓', // 符號
  '😀', // emoji
].join('');

/** 探針中 Noto Sans TC 確實有字形的部分：用來測「字型有、但子集化後畫錯」。 */
export const COVERAGE_PROBE_IN_FONT = '堃喆犇淼鑫焱垚峯裏綫着①②③※→✓';
