// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { BASE, blocksOf, lv, p } from './noise.test-helpers.ts';
import type { ResumeSiteConfig } from './types.ts';

// 標籤＋值配對與介面元素過濾（codex、codex 複審）。blocksOf 每次都斷言過濾後只少不多。

afterEach(() => {
  document.body.innerHTML = '';
});

const after = (html: string, config?: ResumeSiteConfig) => {
  const payload = blocksOf(`<main id="resume"><p>甲</p>${html}</main>`, config);
  if (typeof payload === 'string') throw new Error(payload);
  return payload.blocks.slice(1);
};

describe('表單配對也套用介面元素過濾（codex）', () => {
  it('label 包著的控制項是介面元素：整對不讀（值與標籤都不出）', () => {
    const html = '<label>Title<input class="promo" value="Filtered"></label>';
    expect(after(html, BASE)).toEqual([lv('Title', 'Filtered')]);
    expect(after(html)).toEqual([]);
  });

  it('for 配對：控制項或 label 任一是介面元素，整對不讀', () => {
    expect(after('<label for="x">Title</label><input id="x" class="promo" value="V">')).toEqual([]);
    expect(after('<label for="x" class="promo">Title</label><input id="x" value="V">')).toEqual([]);
    expect(
      after('<div class="promo"><label for="x">T</label></div><input id="x" value="V">'),
    ).toEqual([]);
  });

  it('label 裡夾著介面元素：標籤文字不帶它的字', () => {
    const html = '<label for="x">Title<button>編輯</button></label><input id="x" value="V">';
    expect(after(html)).toEqual([lv('Title', 'V')]);
  });

  it('dt 是介面元素：仍算配對（dt 不出），dd 改當段落', () => {
    const html = '<dl><dt class="promo">廣告</dt><dd>值</dd></dl>';
    expect(after(html, BASE)).toEqual([lv('廣告', '值')]);
    expect(after(html)).toEqual([p('值')]);
    expect(after('<dl><dt>年資<button>編輯</button></dt><dd>3 年</dd></dl>')).toEqual([
      lv('年資', '3 年'),
    ]);
  });
});

describe('過濾不得解除原本被配對抑制的內容（codex 複審）', () => {
  it('dt 標籤扣掉介面元素後變空：dt 仍被配對抑制，裡面的控制項值不出', () => {
    const html = '<dl><dt><button>Title</button><input value="private"></dt><dd>Value</dd></dl>';
    expect(after(html, BASE)).toEqual([lv('Title', 'Value')]);
    expect(after(html)).toEqual([p('Value')]);
  });

  it('dd 是介面元素：原本被配對抑制的 dt 照樣不出', () => {
    const html = '<dl><dt>Title<input value="private"></dt><dd class="promo">Value</dd></dl>';
    expect(after(html, BASE)).toEqual([lv('Title', 'Value')]);
    expect(after(html)).toEqual([]);
  });

  it('label 文字全是介面元素：label 仍被配對抑制，裡面另一個控制項的值不出', () => {
    const html =
      '<label for="x"><button>T</button><input id="y" value="private"></label>' +
      '<input id="x" value="V">';
    expect(after(html, BASE)).toEqual([lv('T', 'V')]);
    expect(after(html)).toEqual([p('V')]);
  });

  it('th 全是介面元素：仍當配對，td 改當段落（不變成新的表格列文字）', () => {
    const html = '<table><tr><th><button>T</button></th><td>V</td></tr></table>';
    expect(after(html, BASE)).toEqual([lv('T', 'V')]);
    expect(after(html)).toEqual([p('V')]);
  });
});
