import { describe, expect, it } from 'vitest';

import { fixturePhoto } from '../__fixtures__/photo.ts';
import { SAMPLE_DOCUMENT } from '../__fixtures__/sample-document.ts';
import type { ResumeDocument } from '../model.ts';

import { buildHtml, escapeHtml } from './html.ts';
import { FONT_FAMILY, TEMPLATE_CSS } from './style.ts';
import { keepWithNextTexts, printedTexts, stripWhitespace, usedCharacters } from './text.ts';

const evil: ResumeDocument = {
  name: '<script>alert(1)</script>',
  contacts: [{ text: '"><img src=x>', href: 'https://example.com/?a="b"&c=<d>' }],
  sections: [{ heading: "標題'", items: [{ kind: 'bullet', text: 'a & b < c' }] }],
};

describe('buildHtml', () => {
  it('跳脫所有內容，不產生可執行標籤', () => {
    const html = buildHtml(evil, []);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('href="https://example.com/?a=&quot;b&quot;&amp;c=&lt;d&gt;"');
    expect(html).toContain('a &amp; b &lt; c');
    expect(html).toContain('標題&#39;');
  });

  it('以 CSP 禁止腳本與網路，只允許 data: 字型', () => {
    const html = buildHtml(SAMPLE_DOCUMENT, [{ weight: 400, url: 'data:font/ttf;base64,AA==' }]);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('font-src data:');
    expect(html).not.toMatch(/script-src/u);
    expect(html).toContain(`font-family: '${FONT_FAMILY}'; src: url('data:font/ttf;base64,AA==')`);
  });

  it('依文件順序印出每段文字', () => {
    const html = buildHtml(SAMPLE_DOCUMENT, []);
    let cursor = 0;
    for (const text of printedTexts(SAMPLE_DOCUMENT)) {
      const at = html.indexOf(escapeHtml(text), cursor);
      expect(at, text).toBeGreaterThanOrEqual(cursor);
      cursor = at;
    }
  });
});

describe('buildHtml：頁首照片（D28）', () => {
  const photo = fixturePhoto();
  const withPhoto: ResumeDocument = { ...SAMPLE_DOCUMENT, photo };

  it('沒有照片：頁首與加照片前相同，沒有任何圖片', () => {
    const html = buildHtml(SAMPLE_DOCUMENT, []);
    expect(html).toContain('<header><h1>林小堃</h1><p class="headline">');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('class="with-photo"');
  });

  it('有照片：頁首放一張 data: 圖片，排在所有頁首文字之後、alt 為空', () => {
    const html = buildHtml(withPhoto, []);
    expect(html.match(/<img /gu)).toHaveLength(1);
    expect(html).toContain(`<img class="photo" src="${photo.dataUri}" alt="">`);
    expect(html).toContain('img-src data:');
    const headerEnd = html.indexOf('</header>');
    const img = html.indexOf('<img');
    expect(img).toBeLessThan(headerEnd);
    expect(img).toBeGreaterThan(html.indexOf(escapeHtml('臺北市')));
  });

  it('有照片：印出的文字與順序不變', () => {
    expect(printedTexts(withPhoto)).toEqual(printedTexts(SAMPLE_DOCUMENT));
    const html = buildHtml(withPhoto, []);
    let cursor = 0;
    for (const text of printedTexts(withPhoto)) {
      const at = html.indexOf(escapeHtml(text), cursor);
      expect(at, text).toBeGreaterThanOrEqual(cursor);
      cursor = at;
    }
  });

  it('照片欄固定寬、不縮；文字欄可縮窄換行（不會被照片蓋住）', () => {
    expect(TEMPLATE_CSS).toMatch(/\.photo \{ flex: none;[^}]*width: 26mm;[^}]*max-height: 34mm;/u);
    expect(TEMPLATE_CSS).toMatch(
      /\.header-text \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/u,
    );
  });
});

describe('模板 CSS', () => {
  it('不靠 CSS 印出文字（::before 只能是空字串）', () => {
    const contents = [...TEMPLATE_CSS.matchAll(/(?<![-\w])content:\s*([^;]+);/gu)].map((m) => m[1]);
    expect(contents.every((c) => c === "''")).toBe(true);
  });

  it('不用 position、overflow: hidden、系統字型（會打亂文字順序、截斷、補字）', () => {
    expect(TEMPLATE_CSS).not.toMatch(/position\s*:/u);
    expect(TEMPLATE_CSS).not.toMatch(/overflow\s*:\s*hidden/u);
    expect(TEMPLATE_CSS).not.toMatch(/sans-serif|PingFang|Helvetica|Arial/u);
  });

  it('A4 版面', () => {
    expect(TEMPLATE_CSS).toContain('@page { size: A4;');
  });
});

describe('文字清單', () => {
  it('printedTexts 以姓名開頭、包含所有段落標題', () => {
    const texts = printedTexts(SAMPLE_DOCUMENT);
    expect(texts[0]).toBe('林小堃');
    for (const s of SAMPLE_DOCUMENT.sections) expect(texts).toContain(s.heading);
  });

  it('keepWithNextTexts 包含段落標題與經歷標題列（標題＋日期）', () => {
    const keep = keepWithNextTexts(SAMPLE_DOCUMENT);
    expect(keep).toContain('工作經歷');
    expect(keep).toContain('星河數位股份有限公司｜資深後端工程師2021/03 – 至今');
  });

  it('usedCharacters 以碼位去重（含 BMP 外的字）', () => {
    const doc: ResumeDocument = { ...evil, name: '𠮷𠮷野家' };
    const chars = [...usedCharacters(doc)];
    expect(chars.filter((c) => c === '𠮷')).toHaveLength(1);
    expect(chars).toContain(' ');
  });

  it('stripWhitespace 去掉換行、空白、全形空白', () => {
    expect(stripWhitespace(' a\n b　c\t')).toBe('abc');
  });
});
