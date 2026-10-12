// @vitest-environment jsdom
import { RESUME_CAPTURE_MAX_BLOCKS, SubmitResumeCaptureRequest } from '@rolecraft/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { buildResumeCapture } from './capture.ts';
import { createChromeOracle, displayKind } from './chrome-oracle.ts';
import { extractBlocks } from './extract.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { ResumeBlock } from './types.ts';

/** P1-T075「審查待修」1–6 的重現（合成 DOM、假資料）。 */

function root(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const el = document.getElementById('root');
  if (!el) throw new Error('no root');
  return el;
}

const texts = (blocks: ResumeBlock[]) => blocks.map((block) => block.text);
const deps = {
  doc: document,
  pageUrl: 'https://resume.example.com/view',
  oracle: simpleOracle,
  now: () => new Date('2026-10-12T00:00:00.000Z'),
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('1 隱藏容器裡的直接文字節點不讀', () => {
  it('未展開的 details 只讀第一個 summary；展開的照讀', () => {
    const html = '<details><summary>摘要</summary>藏的直接文字<p>藏的段落</p></details>';
    expect(texts(extractBlocks(root(html), simpleOracle))).toEqual(['摘要']);
    const open = '<details open><summary>摘要</summary>展開文字</details>';
    expect(texts(extractBlocks(root(open), simpleOracle))).toEqual(['摘要', '展開文字']);
  });

  it('有 shadow root 時，沒被分配到 slot 的子節點不讀', () => {
    const el = root('<div id="host"><span slot="a">顯示</span>未分配文字<b>未分配元素</b></div>');
    const host = document.getElementById('host');
    host?.attachShadow({ mode: 'open' }).append(document.createElement('slot'));
    host?.shadowRoot?.querySelector('slot')?.setAttribute('name', 'a');
    expect(texts(extractBlocks(el, simpleOracle))).toEqual(['顯示']);
  });

  it('content-visibility:hidden 容器的子節點不讀', () => {
    const html = '<div style="content-visibility: hidden">直接文字<p>段落</p></div><p>可見</p>';
    expect(texts(extractBlocks(root(html), simpleOracle))).toEqual(['可見']);
  });

  it('progress／meter 的後備文字不讀', () => {
    const html = '<p>進度<progress value="3" max="10">30% 藏</progress><meter>藏</meter></p>';
    expect(texts(extractBlocks(root(html), simpleOracle))).toEqual(['進度']);
  });

  it('標籤文字（flatText）與抽取一致：dt 裡未展開 details 的內文不進標籤', () => {
    const html = '<dl><dt>技能<details><summary>說明</summary>藏</details></dt><dd>值</dd></dl>';
    expect(extractBlocks(root(html), simpleOracle)).toEqual([
      { kind: 'label_value', level: null, label: '技能 說明', text: '值', continues: false },
    ]);
  });
});

describe('2 display:contents 與 visibility', () => {
  it('display:contents 的子樹照讀，且不換行', () => {
    const html =
      '<p>前<span style="display: contents">中</span>後</p><div style="display:contents"><p>內</p></div>';
    expect(texts(extractBlocks(root(html), simpleOracle))).toEqual(['前中後', '內']);
  });

  it('根節點本身是 display:contents 不算找不到', () => {
    document.body.innerHTML = '<main id="resume" style="display:contents"><p>內容</p></main>';
    const request = buildResumeCapture({ platform: '104', rootSelector: '#resume' }, deps);
    expect(SubmitResumeCaptureRequest.parse(request).payload.blocks).toHaveLength(1);
  });

  it('visibility:hidden 只略過自己的文字，visibility:visible 的子元素照讀；看不到的控制項值不讀', () => {
    const html =
      '<div style="visibility:hidden">藏<p style="visibility: visible">看得到</p>' +
      '<p>也藏</p><input value="藏的值"></div>';
    expect(texts(extractBlocks(root(html), simpleOracle))).toEqual(['看得到']);
  });

  it('Chrome 判定：display 值對應；display:contents 不靠 checkVisibility', () => {
    expect(
      ['contents', 'none', 'inline', 'inline-block', 'block', 'flex', 'list-item'].map(displayKind),
    ).toEqual(['contents', 'none', 'inline', 'inline', 'block', 'block', 'block']);
    const el = root('<span style="display:contents">x</span>').querySelector('span');
    if (!el) throw new Error('no span');
    expect(createChromeOracle().display(el)).toBe('contents');
  });

  it('Chrome 判定：用 chrome.dom 取 shadow root（含封閉的），只回被分配到的子節點', () => {
    const el = root('<div id="host"><i slot="s">分配</i><b>未分配</b></div>');
    const host = document.getElementById('host') as HTMLElement;
    const shadow = host.attachShadow({ mode: 'closed' });
    const slot = document.createElement('slot');
    slot.name = 's';
    shadow.append(slot);
    const oracle = createChromeOracle({
      dom: { openOrClosedShadowRoot: (target) => (target === host ? shadow : null) },
    });
    expect(texts(extractBlocks(el, oracle))).toEqual(['分配']);
    expect(createChromeOracle().shadowSlots(el)).toBeNull();
  });
});

describe('3 white-space 保留換行', () => {
  it('pre／pre-wrap 依換行切並標 continues；一般段落的換行仍是空白', () => {
    const html =
      '<p style="white-space: pre-wrap">第一行\n第二行</p><pre>甲\r\n乙</pre><p>不\n切</p>';
    expect(extractBlocks(root(html), simpleOracle).map((b) => [b.text, b.continues])).toEqual([
      ['第一行', false],
      ['第二行', true],
      ['甲', false],
      ['乙', true],
      ['不 切', false],
    ]);
  });
});

describe('4 dl 配對：隱藏的 dt 切斷配對', () => {
  it('後面的 dd 不繼承前一個標籤，當無標籤段落；隱藏標籤不外流', () => {
    const blocks = extractBlocks(
      root('<dl><dt>Skills</dt><dd>JS</dd><dt hidden>Salary</dt><dd>100</dd></dl>'),
      simpleOracle,
    );
    expect(blocks).toEqual([
      { kind: 'label_value', level: null, label: 'Skills', text: 'JS', continues: false },
      { kind: 'paragraph', level: null, label: null, text: '100', continues: false },
    ]);
    expect(JSON.stringify(blocks)).not.toContain('Salary');
  });
});

describe('5 根節點本身走同一套分類', () => {
  it('標題、清單項、表格列、textarea 根節點', () => {
    document.body.innerHTML =
      '<h2 id="h">標題</h2><ul><li id="li">項目</li></ul>' +
      '<table><tr id="tr"><td>甲</td><td>乙</td></tr></table><textarea id="ta">原始</textarea>';
    const get = (id: string) => document.getElementById(id) as HTMLElement;
    (get('ta') as HTMLTextAreaElement).value = '目前值';
    expect(extractBlocks(get('h'), simpleOracle)[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(extractBlocks(get('li'), simpleOracle)[0]).toMatchObject({
      kind: 'list_item',
      level: 1,
    });
    expect(extractBlocks(get('tr'), simpleOracle)[0]).toMatchObject({
      kind: 'table_row',
      text: '甲\t乙',
    });
    expect(texts(extractBlocks(get('ta'), simpleOracle))).toEqual(['目前值']);
  });
});

describe('6 大量區塊不丟 RangeError', () => {
  it('textarea 15 萬行：截斷到 2,000 塊', () => {
    document.body.innerHTML =
      '<div id="resume"><label>自傳 <textarea id="ta"></textarea></label></div>';
    (document.getElementById('ta') as HTMLTextAreaElement).value = 'a\n'.repeat(150_000);
    const request = SubmitResumeCaptureRequest.parse(
      buildResumeCapture({ platform: '104', rootSelector: '#resume' }, deps),
    );
    expect(request.payload.blocks).toHaveLength(RESUME_CAPTURE_MAX_BLOCKS);
    expect(request.payload.truncated).toBe(true);
  });
});
