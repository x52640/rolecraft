/**
 * 對抗審查重現（P1-T083），只在 RUN_CHROME=1 時跑：RST 開頭、跳到的位置藏 16×16 假 SOF 的真 JPEG。
 * 第一道防線（inspectPhotoSource）要讀到真尺寸；第二道防線（Chrome 頁面解碼前比對尺寸與上限）
 * 即使檔頭檢查被繞過、交給 Chrome 的是錯的尺寸，也要拒絕。
 */
import puppeteer from 'puppeteer-core';
import { beforeAll, describe, expect, it } from 'vitest';

import { findChrome } from '../render/chrome.ts';
import { makePng, smuggleFakeSof } from './jpeg.test-helpers.ts';
import { createPhotoProcessor } from './process.ts';
import { createChromePhotoRenderer, type RenderRequest } from './render.ts';
import { PHOTO_SOURCE_MAX_PIXELS } from './source.ts';

const TIMEOUT = 120_000;

/** 用 Chrome canvas 做一張真的 JPEG（單色，壓縮後很小）。 */
async function realJpeg(executablePath: string, width: number, height: number) {
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const base64 = (await page.evaluate(`(() => {
      const c = document.createElement('canvas');
      c.width = ${width}; c.height = ${height};
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#4a7'; ctx.fillRect(0, 0, ${width}, ${height});
      const url = c.toDataURL('image/jpeg', 0.5);
      return url.slice(url.indexOf(',') + 1);
    })()`)) as string;
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } finally {
    await browser.close();
  }
}

const request = (bytes: Uint8Array, expected: number, maxPixels = PHOTO_SOURCE_MAX_PIXELS) =>
  ({
    dataUri: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`,
    expectedWidth: expected,
    expectedHeight: expected,
    maxPixels,
    maxEdge: 1200,
    quality: 0.9,
    thumbnailEdge: 320,
    thumbnailQuality: 0.8,
  }) satisfies RenderRequest;

describe.runIf(process.env.RUN_CHROME === '1')('假 SOF 夾帶（RUN_CHROME=1）', () => {
  let chrome = '';
  let huge: Uint8Array = new Uint8Array();
  beforeAll(async () => {
    chrome = (await findChrome()) ?? '';
    if (!chrome) throw new Error('找不到 Chrome');
    // 9000×9000＝8,100 萬像素，剛超過上限 8,000 萬
    huge = smuggleFakeSof(await realJpeg(chrome, 9000, 9000), { width: 16, height: 16 });
  }, TIMEOUT);
  const signal = new AbortController().signal;

  it('第一道防線：檔頭檢查讀到真的 9000×9000，拒絕、不交給 Chrome', async () => {
    await expect(createPhotoProcessor().process(huge, { timeoutMs: 45_000 })).rejects.toMatchObject(
      { code: 'too_large' },
    );
  });

  it(
    '第二道防線：檔頭說 16×16 交給 Chrome，解碼前發現實際 9000×9000 超過上限，拒絕',
    async () => {
      const render = createChromePhotoRenderer(chrome);
      await expect(render(request(huge, 16), { timeoutMs: 45_000, signal })).rejects.toMatchObject({
        code: 'too_large',
      });
    },
    TIMEOUT,
  );

  it(
    '第二道防線：尺寸不符（上限內）也拒絕；尺寸相符照常重繪',
    async () => {
      const render = createChromePhotoRenderer(chrome);
      const png = makePng(40, 40, false);
      const pngRequest = {
        ...request(png, 16),
        dataUri: request(png, 16).dataUri.replace('jpeg', 'png'),
      };
      await expect(render(pngRequest, { timeoutMs: 45_000, signal })).rejects.toMatchObject({
        code: 'undecodable',
      });
      const ok = await render(
        { ...pngRequest, expectedWidth: 40, expectedHeight: 40 },
        {
          timeoutMs: 45_000,
          signal,
        },
      );
      expect(ok.photo).toMatchObject({ width: 40, height: 40 });
    },
    TIMEOUT,
  );

  it(
    '上限內的夾帶檔：處理結果是真實尺寸（不是假 SOF 的 16×16）',
    async () => {
      const real = smuggleFakeSof(await realJpeg(chrome, 900, 1200), { width: 16, height: 16 });
      const out = await createPhotoProcessor().process(real, { timeoutMs: 45_000 });
      expect(out).toMatchObject({ width: 900, height: 1200 });
    },
    TIMEOUT,
  );
});
