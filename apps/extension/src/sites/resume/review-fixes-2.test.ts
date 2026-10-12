// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { createChromeOracle } from './chrome-oracle.ts';
import { extractBlocks } from './extract.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { RenderOracle } from './types.ts';

/** P1-T075「複審待修」1–2 的重現（合成 DOM、假資料）。 */

function hostWithShadow(shadowHtml: string, mode: ShadowRootMode = 'open'): HTMLElement {
  document.body.innerHTML =
    '<div id="root"><div id="host"><p slot="s">月薪 假資料</p></div><p>可見</p></div>';
  const host = document.getElementById('host') as HTMLElement;
  const shadow = host.attachShadow({ mode });
  shadow.innerHTML = shadowHtml;
  (host as HTMLElement & { testShadow?: ShadowRoot }).testShadow = shadow;
  return document.getElementById('root') as HTMLElement;
}

const texts = (root: Element, oracle: RenderOracle) =>
  extractBlocks(root, oracle).map((block) => block.text);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('1 slot 在 shadow tree 的收合邊界內：分配的子節點不讀', () => {
  const closedDetails = '<details><summary>Expand</summary><slot name="s"></slot></details>';

  it.each([
    ['未展開 details 裡', closedDetails],
    ['display:none 的祖先裡', '<div style="display:none"><slot name="s"></slot></div>'],
    ['hidden 祖先裡', '<div hidden><slot name="s"></slot></div>'],
    [
      'content-visibility:hidden 祖先裡',
      '<div style="content-visibility:hidden"><slot name="s"></slot></div>',
    ],
    ['巢狀 shadow host 沒分配到的 slot', '<div id="inner"><slot name="s"></slot></div>'],
  ])('%s（簡化判定）', (_name, html) => {
    const root = hostWithShadow(html);
    const inner = document.getElementById('host')?.shadowRoot?.getElementById('inner');
    inner?.attachShadow({ mode: 'open' }).append(document.createElement('slot'));
    inner?.shadowRoot?.querySelector('slot')?.setAttribute('name', 'other');
    expect(texts(root, simpleOracle)).toEqual(['可見']);
  });

  it('展開的 details、summary 裡的 slot 照讀', () => {
    expect(
      texts(hostWithShadow('<details open><slot name="s"></slot></details>'), simpleOracle),
    ).toEqual(['月薪 假資料', '可見']);
    const inSummary = '<details><summary><slot name="s"></slot></summary>藏</details>';
    expect(texts(hostWithShadow(inSummary), simpleOracle)).toEqual(['月薪 假資料', '可見']);
  });

  it('Chrome 判定（封閉 shadow root 經 chrome.dom 取得）同樣擋未展開 details', () => {
    const root = hostWithShadow(closedDetails, 'closed');
    const host = document.getElementById('host') as HTMLElement & { testShadow?: ShadowRoot };
    const shadow = host.testShadow ?? null;
    const oracle = createChromeOracle({
      dom: { openOrClosedShadowRoot: (el) => (el === host ? shadow : null) },
    });
    expect(texts(root, oracle)).toEqual(['可見']);
  });
});

describe('2 大量子節點不 O(N²)', () => {
  const N = 20_000;

  it('未展開 details（沒有 summary）有 2 萬個子節點、每個含控制項', () => {
    const items = '<p>藏 <input value="v"></p>'.repeat(N);
    document.body.innerHTML = `<div id="root"><details>${items}</details><p>可見</p></div>`;
    const start = performance.now();
    expect(texts(document.getElementById('root') as Element, simpleOracle)).toEqual(['可見']);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('shadow host 預設 slot 有 2 萬個子節點', () => {
    document.body.innerHTML = `<div id="root"><div id="host">${'<p>項</p>'.repeat(N)}</div></div>`;
    document
      .getElementById('host')
      ?.attachShadow({ mode: 'open' })
      .append(document.createElement('slot'));
    const start = performance.now();
    expect(texts(document.getElementById('root') as Element, simpleOracle)).toHaveLength(N);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
