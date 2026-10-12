// @vitest-environment jsdom
import { SubmitResumeCaptureRequest } from '@rolecraft/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { buildResumeCapture } from './capture.ts';
import { extractBlocks } from './extract.ts';
import { filterNoiseBlocks, noiseElementMatcher } from './noise.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { ResumeBlock, ResumeSiteConfig, UiNoiseRules } from './types.ts';

/** 合成 DOM、假資料；規則是測試自己登記的，不是任何網站的清單。 */
const RULES: UiNoiseRules = {
  selectors: ['button', '.promo'],
  texts: ['編輯', '前往查看', '  看看  薪資 '],
  headingHints: ['排在第一筆的會當作最高學歷', '提示  字樣'],
};
const BASE: ResumeSiteConfig = { platform: '104', rootSelector: '#resume', nameSelector: '.nm' };
const deps = {
  doc: document,
  pageUrl: 'https://resume.example.com/view',
  oracle: simpleOracle,
  now: () => new Date('2026-10-13T00:00:00.000Z'),
};

const p = (text: string, continues = false): ResumeBlock => ({
  kind: 'paragraph',
  level: null,
  label: null,
  text,
  continues,
});
const h = (level: number, text: string, continues = false): ResumeBlock => ({
  kind: 'heading',
  level,
  label: null,
  text,
  continues,
});

function blocksOf(html: string, config: ResumeSiteConfig = { ...BASE, uiNoise: RULES }) {
  document.body.innerHTML = html;
  const request = buildResumeCapture(config, deps);
  if (typeof request === 'string') return request;
  return SubmitResumeCaptureRequest.parse(request).payload;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('filterNoiseBlocks：完全相等才丟', () => {
  it('整塊等於登記字樣（空白合併後比）才丟；部分相符的使用者內容保留', () => {
    const out = filterNoiseBlocks(
      [p('編輯'), p('負責編輯官網'), p('前往查看'), p('看看 薪資'), p('編輯 '), p('前往查看更多')],
      RULES,
    );
    expect(out).toEqual([p('負責編輯官網'), p('編輯 '), p('前往查看更多')]);
  });

  it('標題不比完全相等：標題文字剛好是登記字樣也保留', () => {
    expect(filterNoiseBlocks([h(2, '編輯')], RULES)).toEqual([h(2, '編輯')]);
  });

  it('標題移除夾帶的提示（只移除登記的整段），移除後變空才丟', () => {
    const out = filterNoiseBlocks(
      [
        h(2, '學歷 排在第一筆的會當作最高學歷'),
        h(2, '排在第一筆的會當作最高學歷'),
        h(3, '專案 提示 字樣 心得'),
        h(2, '排在第一筆'),
      ],
      RULES,
    );
    expect(out).toEqual([h(2, '學歷'), h(3, '專案 心得'), h(2, '排在第一筆')]);
  });

  it('被丟區塊後面的續行改成不續行；前一個保留時續行不變', () => {
    expect(filterNoiseBlocks([p('編輯'), p('甲', true), p('乙', true)], RULES)).toEqual([
      p('甲'),
      p('乙', true),
    ]);
    expect(filterNoiseBlocks([p('甲'), p('編輯', true), p('乙', true)], RULES)).toEqual([
      p('甲'),
      p('乙'),
    ]);
  });

  it('沒登記規則：原樣回傳', () => {
    const blocks = [p('編輯'), h(2, '排在第一筆的會當作最高學歷')];
    expect(filterNoiseBlocks(blocks, undefined)).toEqual(blocks);
    expect(filterNoiseBlocks(blocks, null)).toEqual(blocks);
  });
});

describe('選擇器過濾', () => {
  it('符合選擇器的元素整棵不讀（同一列的按鈕不會接成「編輯版型」）', () => {
    const payload = blocksOf(
      '<main id="resume"><div>職稱<button>編輯</button><button>版型</button></div>' +
        '<div class="promo">免費檢測</div><p>描述</p></main>',
    );
    expect(payload).not.toBe('not_found');
    if (typeof payload === 'string') return;
    expect(payload.blocks).toEqual([p('職稱'), p('描述')]);
  });

  it('寫錯的選擇器當作不符（不過濾），其他選擇器照常', () => {
    const match = noiseElementMatcher({ selectors: ['[[', 'button'], texts: [], headingHints: [] });
    document.body.innerHTML = '<p>甲</p><button>乙</button>';
    const [para, button] = Array.from(document.body.children);
    expect(match?.(para as Element)).toBe(false);
    expect(match?.(button as Element)).toBe(true);
    expect(noiseElementMatcher({ selectors: [], texts: ['x'], headingHints: [] })).toBeNull();
  });

  it('根節點本身符合選擇器也不會整個被丟', () => {
    document.body.innerHTML = '<button id="r">甲</button>';
    const root = document.getElementById('r') as Element;
    const isNoise = noiseElementMatcher(RULES);
    expect(extractBlocks(root, simpleOracle, isNoise)).toEqual([p('甲')]);
  });

  it('表格儲存格符合選擇器：該格不讀', () => {
    document.body.innerHTML = '<table id="r"><tr><td>甲</td><td class="promo">乙</td></tr></table>';
    const root = document.getElementById('r') as Element;
    const blocks = extractBlocks(root, simpleOracle, noiseElementMatcher(RULES));
    expect(blocks.map((b) => b.text)).toEqual(['甲']);
  });
});

describe('個資範圍不擴大', () => {
  const PAGE =
    '<main id="resume"><div class="nm">王小明</div><h2>學歷 排在第一筆的會當作最高學歷</h2>' +
    '<p>範例大學</p><div style="display:none"><p>0900-000-000</p><button>編輯</button></div>' +
    '<button><span hidden>a@example.com</span>更多</button>' +
    '<div aria-hidden="true">台北市範例路</div><button>編輯</button></main>' +
    '<aside>站外 前往查看</aside>';

  it('過濾前後：隱藏與根節點外的內容都讀不到，姓名元素文字不變', () => {
    const before = blocksOf(PAGE, BASE);
    const after = blocksOf(PAGE);
    if (typeof before === 'string' || typeof after === 'string') throw new Error('not_found');
    for (const payload of [before, after]) {
      const sent = payload.blocks.map((b) => b.text).join('\n');
      for (const secret of ['0900-000-000', 'a@example.com', '台北市範例路', '站外']) {
        expect(sent).not.toContain(secret);
      }
    }
    expect(after.nameText).toBe('王小明');
    expect(after.nameText).toBe(before.nameText);
    expect(after.blocks).toEqual([p('王小明'), h(2, '學歷'), p('範例大學')]);
    expect(before.blocks.map((b) => b.text)).toEqual([
      '王小明',
      '學歷 排在第一筆的會當作最高學歷',
      '範例大學',
      '更多編輯',
    ]);
  });

  it('姓名元素在符合選擇器的元素裡也照讀（過濾只用在抽取區塊）', () => {
    const payload = blocksOf(
      '<main id="resume"><button><span class="nm">王小明</span></button><p>甲</p></main>',
    );
    if (typeof payload === 'string') throw new Error('not_found');
    expect(payload.nameText).toBe('王小明');
    expect(payload.blocks).toEqual([p('甲')]);
  });

  it('沒登記規則的站：結果和直接抽取完全相同', () => {
    const html =
      '<main id="resume"><h2>學歷 排在第一筆的會當作最高學歷</h2><button>編輯</button><p>前往查看</p></main>';
    const payload = blocksOf(html, BASE);
    if (typeof payload === 'string') throw new Error('not_found');
    const root = document.getElementById('resume') as Element;
    expect(payload.blocks).toEqual(extractBlocks(root, simpleOracle));
    expect(payload.blocks).toHaveLength(3);
  });

  it('全部都是介面字樣：當作沒有內容（not_found，不送）', () => {
    expect(blocksOf('<main id="resume"><button>編輯</button><p>前往查看</p></main>')).toBe(
      'not_found',
    );
  });
});

describe('表單配對也套用介面元素過濾（codex）', () => {
  const lv = (label: string, text: string): ResumeBlock => ({
    kind: 'label_value',
    level: null,
    label,
    text,
    continues: false,
  });
  const after = (html: string, config?: ResumeSiteConfig) => {
    const payload = blocksOf(`<main id="resume"><p>甲</p>${html}</main>`, config);
    if (typeof payload === 'string') throw new Error(payload);
    return payload.blocks.slice(1);
  };

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

  it('dt 是介面元素：不當標籤、切斷配對，dd 照常當段落', () => {
    const html = '<dl><dt class="promo">廣告</dt><dd>值</dd></dl>';
    expect(after(html, BASE)).toEqual([lv('廣告', '值')]);
    expect(after(html)).toEqual([p('值')]);
    expect(after('<dl><dt>年資<button>編輯</button></dt><dd>3 年</dd></dl>')).toEqual([
      lv('年資', '3 年'),
    ]);
  });
});
