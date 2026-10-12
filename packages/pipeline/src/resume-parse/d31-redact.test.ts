// P1-T093 送模型前遮蔽網址與區級居住地（D31）：網址各形態、居住地各形態、不該遮的、PDF 路線。
// 資料全為合成、去識別化；不呼叫任何模型。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { prepareResumeParse } from './prepare.ts';
import { createRedactor, unredact } from './redact.ts';
import { TW_DISTRICTS } from './tw-districts.ts';

const redactOne = (text: string) => createRedactor([]).redact(text);

/** 遮蔽後被換掉的原文片段（依出現順序）。 */
function masked(text: string): string[] {
  const { redact, tokens } = createRedactor([]);
  const out = redact(text);
  expect(unredact(out, tokens)).toBe(text);
  return [...out.matchAll(/〔個資\d+〕/gu)].map((m) => tokens.get(m[0]) ?? '');
}

describe('網址（D31）', () => {
  it.each([
    ['負責三家門市的日常：https://example.com/portfolio', ['https://example.com/portfolio']],
    ['日常：https://example.com/portfolio，負責', ['https://example.com/portfolio，']],
    [
      '作品 HTTPS://Example.COM/Work 與 Http://sample.org',
      ['HTTPS://Example.COM/Work', 'Http://sample.org'],
    ],
    ['網站：www.sample-site.com.tw/about。', ['www.sample-site.com.tw/about']],
    ['WWW.Sample.ORG', ['WWW.Sample.ORG']],
    ['作品集（https：//example.com/a）', ['https：//example.com/a）']],
    ['ｈｔｔｐｓ://ｅｘａｍｐｌｅ.com/x 說明', ['ｈｔｔｐｓ://ｅｘａｍｐｌｅ.com/x']],
    [
      // 全形「，」「：」NFKC 後是 ASCII，網址一路延伸到下一個網址（寧可多遮）
      'GitHub：github.com/sample-dev，LinkedIn：linkedin.com/in/sample',
      ['github.com/sample-dev，LinkedIn：linkedin.com/in/sample'],
    ],
    ['作品 behance.net/sample 與 sample.dev/', ['behance.net/sample', 'sample.dev/']],
    [
      'GitHub github.com/sample-dev 、 LinkedIn linkedin.com/in/sample',
      ['github.com/sample-dev', 'linkedin.com/in/sample'],
    ],
    ['部落格 blog.sample.com.tw/posts/1', ['blog.sample.com.tw/posts/1']],
  ])('%s', (text, expected) => {
    expect(masked(text)).toEqual(expected);
  });

  it.each([
    '熟悉 Node.js、ASP.NET、Vue.js',
    '使用 ASP.NET/C# 與 VB.NET/ADO.NET 開發',
    '撰寫 deploy.sh/build.sh 與 Next.js/React',
    'smalltown.tw 書店網站改版',
    'awww.ok 不是網址開頭',
    '2019/03 – 2020/08',
  ])('不算網址：%s', (text) => {
    expect(redactOne(text)).toBe(text);
  });
});

describe('區級居住地（D31）', () => {
  it.each([
    ['新北市中和區', ['新北市中和區']],
    ['屏東縣屏東市', ['屏東縣屏東市']],
    ['臺北市 大安區', ['臺北市 大安區']],
    ['台北市大安區', ['台北市大安區']],
    ['高雄市苓雅區5~6年工作經驗', ['高雄市苓雅區']],
    ['台南市東區門市店長', ['台南市東區']],
    ['住在高雄市苓雅區四維三路2號5樓，通勤', ['高雄市苓雅區四維三路2號5樓']],
    ['新北市板橋區文化路一段188巷3弄12號之1 3F', ['新北市板橋區文化路一段188巷3弄12號之1 3F']],
    ['臺中市西屯區台灣大道三段99號', ['臺中市西屯區台灣大道三段99號']],
    ['臺北縣中和市中山路二段**號', ['臺北縣中和市中山路二段**號']],
    ['高雄縣鳳山市', ['高雄縣鳳山市']],
    ['雲林縣台西鄉', ['雲林縣台西鄉']],
    ['台東縣臺東市', ['台東縣臺東市']],
    ['桃園縣中壢市', ['桃園縣中壢市']],
    ['高雄市、台南市東區、台南市北區、屏東縣屏東市', ['台南市東區', '台南市北區', '屏東縣屏東市']],
    ['臺南市南化區', ['臺南市南化區']],
  ])('%s', (text, expected) => {
    expect(masked(text)).toEqual(expected);
  });

  it.each([
    '高雄市',
    '林雨晴 Ivy Lin，高雄人。',
    '苓雅區',
    '台北市立大學',
    '高雄市立中正高中',
    '海外／新加坡門市服務人員',
    '台南市安平古堡導覽',
    '新竹縣政府',
  ])('不遮：%s', (text) => {
    expect(redactOne(text)).toBe(text);
  });

  it('名單涵蓋 22 縣市 368 鄉鎮市區（舊縣名另計）', () => {
    const OLD = ['臺北縣', '桃園縣', '臺中縣', '臺南縣', '高雄縣'];
    const current = Object.entries(TW_DISTRICTS).filter(([county]) => !OLD.includes(county));
    expect(current).toHaveLength(22);
    expect(current.flatMap(([, d]) => d.split(' '))).toHaveLength(368);
  });

  it('縣市與鄉鎮市區要配對：別的縣市的區名不算', () => {
    expect(redactOne('屏東縣苓雅區')).toBe('屏東縣苓雅區');
    expect(redactOne('高雄市屏東市')).toBe('高雄市屏東市');
  });
});

describe('PDF 路線（personal.ts 經同一遮蔽器）', () => {
  it('送出的提示不含網址與區級地址；只有縣市照送；本機行原文不變', () => {
    const result = prepareResumeParse(
      {
        pages: [
          {
            pageNumber: 1,
            lines: [
              '工作經驗',
              '門市店長 台南市東區門市店長',
              '作品集 https://example.com/portfolio 與 www.sample.org',
              'GitHub github.com/sample-dev',
              '希望地點：高雄市、屏東縣屏東市',
              '居住於新北市中和區景平路100號',
            ],
          },
        ],
        names: [],
        personalHints: [],
      },
      budget(1e6),
      idSource('d'),
    );
    if (!result.ok) throw new Error(result.reason);
    const { prompt, lines } = result.prepared;
    for (const s of [
      'http',
      'www.',
      'github.com',
      '台南市東區',
      '屏東縣屏東市',
      '新北市中和區',
      '景平路',
    ])
      expect(prompt).not.toContain(s);
    expect(prompt).toContain('高雄市');
    expect(prompt).toContain('門市店長');
    expect(lines.map((l) => l.original)).toContain('GitHub github.com/sample-dev');
  });
});

const CODEX_ADDRESSES = [
  '臺中市西屯區工業區38路100號',
  '臺中市西屯區工業區３８路１００號',
  '新北市中和區景平路100之1號5樓',
  '新北市中和區景平路100-1號5樓',
  '高雄市苓雅區四維三路100－1號5樓之2',
  '臺北市大安區復興南路一段390號地下1樓',
  '臺北市信義區松仁路100號B1',
  '台南市東區大學路1巷2弄3號4樓302室',
];

describe('codex 審查 3 項（數字路名、之／- 門牌、.NET 例外只限獨立詞）', () => {
  it.each(CODEX_ADDRESSES)('整段地址一起遮：%s', (text) => {
    expect(masked(text)).toEqual([text]);
  });

  it.each([
    ['作品 team.asp.net/portfolio', ['team.asp.net/portfolio']],
    ['作品 asp.net/portfolio', ['asp.net/portfolio']],
    ['sample.vb.net/x 與 my-ado.net/y', ['sample.vb.net/x', 'my-ado.net/y']],
  ])('.NET 尾綴的網域照遮：%s', (text, expected) => {
    expect(masked(text)).toEqual(expected);
  });

  it.each(['ASP.NET/C#', 'asp.net/MVC 與 VB.NET/WinForms', 'ADO.NET/SQL'])(
    '獨立的 .NET 技術詞接技術詞不遮：%s',
    (text) => {
      expect(redactOne(text)).toBe(text);
    },
  );

  it('PDF 路線的提示不含上述地址與網址', () => {
    const result = prepareResumeParse(
      {
        pages: [
          {
            pageNumber: 1,
            lines: ['工作經驗', ...CODEX_ADDRESSES, '作品 team.asp.net/portfolio'],
          },
        ],
        names: [],
        personalHints: [],
      },
      budget(1e6),
      idSource('c'),
    );
    if (!result.ok) throw new Error(result.reason);
    const leaks = [
      '38路',
      '３８路',
      '100之1',
      '100-1',
      '100－1',
      '地下1樓',
      'B1',
      '302室',
      'asp.net',
    ];
    for (const s of leaks) expect(result.prepared.prompt).not.toContain(s);
  });
});
