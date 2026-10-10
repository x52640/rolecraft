import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadFixtureFonts } from '../__fixtures__/fonts.ts';
import { PdfExportError } from '../errors.ts';

import { assertStaticTrueType, loadBundledFonts, sha256Hex } from './bundled.ts';
import { describeFont, findMissingGlyphs } from './font-set.ts';
import { BUNDLED_FONT_FILES, NOTO_SANS_TC_REGULAR } from './manifest.ts';
import { subsetForText } from './subset.ts';

const fixture = loadFixtureFonts();

describe('describeFont', () => {
  it('讀出 PostScript 名稱、碼位、靜態 TrueType', () => {
    const regular = describeFont(fixture.regular);
    expect(regular.postscriptName).toBe('NotoSansTC-Regular');
    expect(regular.trueTypeOutlines).toBe(true);
    expect(regular.variable).toBe(false);
    expect(regular.codePoints.has(0x5c0f)).toBe(true); // 小
    expect(describeFont(fixture.bold).postscriptName).toBe('NotoSansTC-Bold');
  });

  it('assertStaticTrueType 接受 fixture、拒絕不是字型的資料', () => {
    expect(() => assertStaticTrueType(fixture.regular, 'r')).not.toThrow();
    expect(() => assertStaticTrueType(new Uint8Array([1, 2, 3]), 'x')).toThrow(PdfExportError);
  });
});

describe('findMissingGlyphs（ADR-0005 檢查 2）', () => {
  const infos = [describeFont(fixture.regular), describeFont(fixture.bold)];

  it('字型都有的字不算缺字；換行與 tab 會被 HTML 收合，不檢查', () => {
    expect(findMissingGlyphs('林小堃\n資深\t工程師 ABC', infos)).toEqual([]);
  });

  it('列出缺字（含 BMP 外字、emoji、變體選擇符），去重', () => {
    expect(findMissingGlyphs('𠮷野家😀😀❤️', infos)).toEqual([
      { char: '𠮷', codePoint: 'U+20BB7' },
      { char: '野', codePoint: 'U+91CE' },
      { char: '家', codePoint: 'U+5BB6' },
      { char: '😀', codePoint: 'U+1F600' },
      { char: '❤', codePoint: 'U+2764' },
      { char: '️', codePoint: 'U+FE0F' },
    ]);
  });

  it('只要任一字重缺字就算缺字', () => {
    const boldOnly = { ...infos[1]!, codePoints: new Set<number>() };
    expect(findMissingGlyphs('林', [infos[0]!, boldOnly])).toEqual([
      { char: '林', codePoint: 'U+6797' },
    ]);
  });
});

describe('subsetForText（康熙部首回測，ADR-0005 發現 2）', () => {
  it('fixture 字型同時有「小」與康熙部首「⼩」', () => {
    const cps = describeFont(fixture.regular).codePoints;
    expect(cps.has(0x5c0f)).toBe(true);
    expect(cps.has(0x2f29)).toBe(true);
  });

  it('裁切後 cmap 只剩原文用到的碼位，部首碼位消失', async () => {
    const subset = await subsetForText(fixture.regular, '小一人大 ');
    const info = describeFont(subset);
    expect([...info.codePoints].sort((a, b) => a - b)).toEqual([
      0x20, 0x4e00, 0x4eba, 0x5927, 0x5c0f,
    ]);
    expect(info.postscriptName).toBe('NotoSansTC-Regular');
    expect(info.trueTypeOutlines).toBe(true);
  });
});

describe('loadBundledFonts', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('manifest 三個檔案都有 64 位 sha256', () => {
    expect(BUNDLED_FONT_FILES).toHaveLength(3);
    for (const f of BUNDLED_FONT_FILES) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('缺檔時拒絕', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'rc-fonts-'));
    await expect(loadBundledFonts(dir)).rejects.toMatchObject({ code: 'fonts_unavailable' });
  });

  it('雜湊不符時拒絕（例如換成別的字型）', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'rc-fonts-'));
    for (const f of BUNDLED_FONT_FILES)
      await writeFile(path.join(dir, f.fileName), fixture.regular);
    expect(sha256Hex(fixture.regular)).not.toBe(NOTO_SANS_TC_REGULAR.sha256);
    await expect(loadBundledFonts(dir)).rejects.toMatchObject({ code: 'fonts_unavailable' });
  });
});
