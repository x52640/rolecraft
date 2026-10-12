// P1-T075 只能在真實 Chrome 驗的渲染判定（計算後樣式、封閉 shadow root），只在 RUN_CHROME=1 時跑。
// 合成 DOM、全是假資料；跑在擴充功能隔離環境，用正式的 `createChromeOracle(chrome)` 與共用擷取流程。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROME_TIMEOUT,
  type ChromeProbe,
  launchChromeProbe,
  type ProbeRequest,
  RUN_CHROME,
} from './chrome.test-helpers.ts';

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"></head>
<body>${body}</body></html>`;

describe.runIf(RUN_CHROME)('真實 Chrome 渲染判定（RUN_CHROME=1）', () => {
  let probe: ChromeProbe;
  let seq = 0;

  /** 擷取 #r：回傳「種類(+續行):文字」清單；找不到根節點回 'not_found'。 */
  async function run(body: string, request: Partial<ProbeRequest> = {}) {
    const pathname = `/case-${(seq += 1)}`;
    probe.serve(pathname, page(body));
    const result = await probe.capture(pathname, { rootSelector: '#r', ...request });
    if (typeof result === 'string') return { lines: result, nameText: null };
    if (!('op' in result)) throw new Error(result.error);
    const { blocks, nameText } = result.payload;
    const lines = blocks.map((b) => `${b.kind}${b.continues ? '+' : ''}:${b.text}`);
    return { lines, nameText };
  }

  beforeAll(async () => {
    probe = await launchChromeProbe();
  }, CHROME_TIMEOUT);

  afterAll(async () => {
    await probe?.close();
  });

  it('display:contents：子節點照讀（不像 checkVisibility 整棵丟掉）；根節點本身也可以是 contents', async () => {
    const nested = await run(`<div id="r"><div style="display:contents"><p>甲段</p><span>乙</span>
      <span>丙</span></div><ul style="display:contents"><li>項一</li></ul></div>`);
    expect(nested.lines).toEqual(['paragraph:甲段', 'paragraph:乙 丙', 'list_item:項一']);
    const root = await run(`<div id="r" style="display:contents"><p>根是 contents</p></div>`);
    expect(root.lines).toEqual(['paragraph:根是 contents']);
  });

  it('visibility 繼承：hidden 底下的文字不讀，子元素設回 visible 照讀；姓名元素繼承 hidden 不讀', async () => {
    const result = await run(
      `<div id="r"><div style="visibility:hidden">藏起來<span>也藏</span>
        <span style="visibility:visible">露出來</span><p style="visibility:visible">段落露出</p></div>
        <p>正常</p></div><div style="visibility:hidden"><span class="n">假名字</span></div>`,
      { nameSelector: '.n' },
    );
    expect(result.lines).toEqual(['paragraph:露出來', 'paragraph:段落露出', 'paragraph:正常']);
    expect(result.nameText).toBeNull();
  });

  it('content-visibility:hidden 的子節點不讀；content-visibility:auto 在畫面外照讀', async () => {
    const result = await run(`<div id="r"><div style="content-visibility:hidden"><p>藏內容</p>
      直接文字</div><p>看得到</p><div style="height:5000px"></div>
      <div style="content-visibility:auto"><p>畫面外也讀</p></div></div>`);
    expect(result.lines).toEqual(['paragraph:看得到', 'paragraph:畫面外也讀']);
  });

  it('white-space：pre、pre-line、preserve-breaks 保留換行並切成續行；一般元素換行當空白', async () => {
    const result = await run(
      '<div id="r"><pre>第一行\n第二行</pre><div style="white-space:pre-line">甲行\n乙行</div>' +
        '<div>不保留\n換行</div><div style="white-space-collapse:preserve-breaks">保一\n保二</div></div>',
    );
    expect(result.lines).toEqual([
      'paragraph:第一行',
      'paragraph+:第二行',
      'paragraph:甲行',
      'paragraph+:乙行',
      'paragraph:不保留 換行',
      'paragraph:保一',
      'paragraph+:保二',
    ]);
  });

  const CLOSED_SHADOW = `<div id="r"><div><template shadowrootmode="closed"><h2>影子裡的標題</h2>
    <slot name="a"></slot></template><p slot="a">分配到的</p><p slot="b">沒分配的</p>
    <p>預設也沒分配</p></div></div>`;

  it('封閉 shadow root：只讀分配到 slot 的子節點（chrome.dom 才拿得到封閉的 shadow root）', async () => {
    expect((await run(CLOSED_SHADOW)).lines).toEqual(['paragraph:分配到的']);
    // 對照：沒有 chrome.dom 看不到封閉的 shadow root，沒分配的也被讀到（證明上面真的走到封閉 shadow root）
    const blind = await run(CLOSED_SHADOW, { useChromeDom: false });
    expect(blind.lines).toEqual([
      'paragraph:分配到的',
      'paragraph:沒分配的',
      'paragraph:預設也沒分配',
    ]);
  });

  it('shadow 內收合區的 slot：未展開 details、display:none 裡的 slot 分到的不讀；展開的照讀', async () => {
    const result = await run(`<div id="r"><div><template shadowrootmode="closed">
      <details><summary>影子摘要</summary><slot></slot></details>
      <div style="display:none"><slot name="y"></slot></div>
      <details open><summary>開</summary><slot name="o"></slot></details>
      <slot name="x"></slot></template>
      <p>收合裡的</p><p slot="y">隱藏區裡的</p><p slot="o">展開裡的</p><p slot="x">外面的</p></div></div>`);
    expect(result.lines).toEqual(['paragraph:展開裡的', 'paragraph:外面的']);
  });

  it('未展開的 details 只讀 summary；展開的全讀', async () => {
    const result = await run(`<div id="r"><details><summary>摘要一</summary><p>未展開內文</p>
      </details><details open><summary>摘要二</summary><p>展開內文</p></details></div>`);
    expect(result.lines).toEqual(['paragraph:摘要一', 'paragraph:摘要二', 'paragraph:展開內文']);
  });

  it('根節點在 display:none 祖先底下：找不到根節點、不送', async () => {
    const result = await run(`<div style="display:none"><div id="r"><p>藏</p></div></div>`);
    expect(result.lines).toBe('not_found');
  });
});
