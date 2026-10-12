// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { extractBlocks } from './extract.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { ResumeBlock } from './types.ts';

/** 合成 DOM（全是假資料）：根節點是 #root。 */
function blocksOf(html: string): ResumeBlock[] {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const root = document.getElementById('root');
  if (!root) throw new Error('no root');
  return extractBlocks(root, simpleOracle);
}

const p = (text: string, continues = false): ResumeBlock => ({
  kind: 'paragraph',
  level: null,
  label: null,
  text,
  continues,
});
const li = (level: number, text: string, continues = false): ResumeBlock => ({
  kind: 'list_item',
  level,
  label: null,
  text,
  continues,
});
const lv = (label: string, text: string, continues = false): ResumeBlock => ({
  kind: 'label_value',
  level: null,
  label,
  text,
  continues,
});
const row = (text: string): ResumeBlock => ({
  kind: 'table_row',
  level: null,
  label: null,
  text,
  continues: false,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractBlocks：區塊單位', () => {
  it('標題：層級＝數字；連續空白合併成一格', () => {
    expect(blocksOf('<h2>  工作   經歷 </h2><h4>專案</h4>')).toEqual([
      { kind: 'heading', level: 2, label: null, text: '工作 經歷', continues: false },
      { kind: 'heading', level: 4, label: null, text: '專案', continues: false },
    ]);
  });

  it('巢狀清單：內層各自成區塊、不重複計入外層；被打斷的後段不標 continues', () => {
    expect(blocksOf('<ul><li>甲<ul><li>乙</li></ul>丙</li><li>丁</li></ul>')).toEqual([
      li(1, '甲'),
      li(2, '乙'),
      li(1, '丙'),
      li(1, '丁'),
    ]);
  });

  it('li 內含 p：文字屬於清單項，p 造成的換行切成續行', () => {
    expect(blocksOf('<ol><li><p>負責 A 系統</p><p>帶領 3 人</p></li></ol>')).toEqual([
      li(1, '負責 A 系統'),
      li(1, '帶領 3 人', true),
    ]);
  });

  it('七層清單：最內層記 6', () => {
    const html = '<ul><li>L1'.concat(
      ['L2', 'L3', 'L4', 'L5', 'L6', 'L7'].map((t) => `<ul><li>${t}`).join(''),
      '</li></ul>'.repeat(7),
    );
    const blocks = blocksOf(html);
    expect(blocks.map((b) => [b.text, b.level])).toEqual([
      ['L1', 1],
      ['L2', 2],
      ['L3', 3],
      ['L4', 4],
      ['L5', 5],
      ['L6', 6],
      ['L7', 6],
    ]);
  });

  it('表格列：儲存格以 Tab 連接，儲存格內換行併成空白', () => {
    expect(
      blocksOf(
        '<table><tr><th>公司</th><th>職稱</th><th>期間</th></tr>' +
          '<tr><td>範例公司</td><td>工程師</td><td>2020<br>2022</td></tr></table>',
      ),
    ).toEqual([row('公司\t職稱\t期間'), row('範例公司\t工程師\t2020 2022')]);
  });

  it('巢狀表格：內層列各自成區塊，排在外層列之後', () => {
    expect(
      blocksOf(
        '<table><tr><td>外</td><td><table><tr><td>內1</td><td>內2</td></tr></table></td></tr></table>',
      ),
    ).toEqual([row('外\t'), row('內1\t內2')]);
  });

  it('段落：以最近的區塊層級祖先為一段；被巢狀區塊打斷就分段', () => {
    expect(blocksOf('<div>前文<ul><li>項目</li></ul>後文</div><p>另一段</p>')).toEqual([
      p('前文'),
      li(1, '項目'),
      p('後文'),
      p('另一段'),
    ]);
  });

  it('br 換行切成多個區塊，第二個以後標 continues；不同元素不標', () => {
    expect(blocksOf('<p>第一行<br>第二行<br><br>第三行</p><p>下一段</p>')).toEqual([
      p('第一行'),
      p('第二行', true),
      p('第三行', true),
      p('下一段'),
    ]);
  });

  it('行內元素不換行', () => {
    expect(blocksOf('<p>熟悉 <b>TypeScript</b> 與 <span>React</span></p>')).toEqual([
      p('熟悉 TypeScript 與 React'),
    ]);
  });
});

describe('extractBlocks：標籤＋值', () => {
  it('dt＋dd（含一個 dt 對多個 dd），標籤不另成區塊', () => {
    expect(
      blocksOf('<dl><dt>語言</dt><dd>中文</dd><dd>英文</dd><dt>駕照</dt><dd>普通小型車</dd></dl>'),
    ).toEqual([lv('語言', '中文'), lv('語言', '英文'), lv('駕照', '普通小型車')]);
  });

  it('只有 th＋td 兩格的列是標籤＋值；值的換行切成續行', () => {
    expect(blocksOf('<table><tr><th>學歷</th><td>範例大學<br>資訊系</td></tr></table>')).toEqual([
      lv('學歷', '範例大學'),
      lv('學歷', '資訊系', true),
    ]);
  });

  it('label＋控制項：包住控制項與 for 指向兩種', () => {
    document.body.innerHTML = '';
    const blocks = blocksOf(
      '<label>希望職稱 <input type="text" value="前端工程師"></label>' +
        '<label for="city">地點</label><p>說明文字</p><input id="city" value="台北市">',
    );
    expect(blocks).toEqual([lv('希望職稱', '前端工程師'), p('說明文字'), lv('地點', '台北市')]);
  });

  it('label＋select：取選中項的文字', () => {
    expect(
      blocksOf(
        '<label>學歷 <select><option value="a">高中</option><option value="b" selected>大學</option></select></label>',
      ),
    ).toEqual([lv('學歷', '大學')]);
  });
});

describe('extractBlocks：不讀的內容', () => {
  it('隱藏元素四種都不讀', () => {
    expect(
      blocksOf(
        '<p style="display:none">甲</p><p style="visibility:hidden">乙</p>' +
          '<p hidden>丙</p><p aria-hidden="true">丁</p><p>可見</p>',
      ),
    ).toEqual([p('可見')]);
  });

  it('script、style、noscript、template、svg、圖片（含 alt）不讀', () => {
    expect(
      blocksOf(
        '<p>文字<script>var secret = 1;</script><style>.x{}</style><noscript>無腳本</noscript>' +
          '<template><p>樣板</p></template><svg><text>向量</text></svg>' +
          '<img alt="大頭照 王小明" src="https://img.example/a.png"></p>',
      ),
    ).toEqual([p('文字')]);
  });

  it('密碼、隱藏、檔案欄位不讀；未配 label 的一般欄位當文字讀；textarea 換行切續行', () => {
    const html =
      '<p>帳號 <input type="password" value="假密碼123"><input type="hidden" value="token-xyz">' +
      '<input type="file"></p>' +
      '<label>自傳 <textarea>第一段\n第二段</textarea></label>' +
      '<p>電話 <input type="tel" value="0900-000-000"></p>';
    expect(blocksOf(html)).toEqual([
      p('帳號'),
      lv('自傳', '第一段'),
      lv('自傳', '第二段', true),
      p('電話 0900-000-000'),
    ]);
  });

  it('密碼欄位的 label 不配對，label 文字當一般段落', () => {
    expect(blocksOf('<label>密碼 <input type="password" value="假密碼"></label>')).toEqual([
      p('密碼'),
    ]);
  });

  it('不輸出 HTML、屬性值、連結網址與查詢字串', () => {
    const blocks = blocksOf(
      '<p class="secret-class" data-id="u-123"><a href="https://site.example/p/9?token=abc#x" title="提示">個人網站</a></p>',
    );
    expect(blocks).toEqual([p('個人網站')]);
    const json = JSON.stringify(blocks);
    for (const banned of ['<', 'href', 'https', 'token', 'secret-class', 'u-123', '提示']) {
      expect(json).not.toContain(banned);
    }
  });

  it('沒有可讀內容回空陣列', () => {
    expect(blocksOf('<div style="display:none"><p>藏</p></div>   ')).toEqual([]);
  });
});
