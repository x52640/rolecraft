/**
 * 真的用本機 Chrome 重繪照片，只在 RUN_CHROME=1 時跑（需要 Google Chrome）。
 * 合成照片帶 GPS／裝置字樣的中繼資料；驗證處理後的位元組沒有任何中繼資料、最長邊 ≤ 1,200 px。
 */
import { describe, expect, it } from 'vitest';

import { inspectJpeg, metadataProblems } from './jpeg.ts';
import {
  concat,
  containsText,
  DEVICE_MARKER,
  EXIF_GPS,
  GPS_MARKER,
  makePng,
} from './jpeg.test-helpers.ts';
import { createPhotoProcessor } from './process.ts';

const TIMEOUT = 60_000;

function expectClean(bytes: Uint8Array) {
  expect(metadataProblems(bytes)).toEqual([]);
  expect(containsText(bytes, GPS_MARKER)).toBe(false);
  expect(containsText(bytes, DEVICE_MARKER)).toBe(false);
  expect(containsText(bytes, 'Exif')).toBe(false);
}

describe.runIf(process.env.RUN_CHROME === '1')('照片重繪（RUN_CHROME=1）', () => {
  const processor = createPhotoProcessor();

  it(
    '帶中繼資料的 PNG 與 JPEG：重新編碼、縮到 1,200 px、沒有中繼資料；縮圖可解讀',
    async () => {
      const png = makePng(1800, 2400);
      expect(containsText(png, GPS_MARKER)).toBe(true);
      const fromPng = await processor.process(png, { timeoutMs: 45_000 });
      expect(fromPng).toMatchObject({ width: 900, height: 1200 });
      expectClean(fromPng.content);
      expectClean(fromPng.thumbnail);
      expect(inspectJpeg(fromPng.content)).toMatchObject({ width: 900, height: 1200 });

      // 把 EXIF／GPS 塞回真的 JPEG（SOI 之後），再處理一次
      const jpeg = concat(fromPng.content.subarray(0, 2), EXIF_GPS, fromPng.content.subarray(2));
      expect(containsText(jpeg, GPS_MARKER)).toBe(true);
      const fromJpeg = await processor.process(jpeg, { timeoutMs: 45_000 });
      expect(fromJpeg).toMatchObject({ width: 900, height: 1200 });
      expectClean(fromJpeg.content);

      const thumb = await processor.thumbnail(fromJpeg.content, { timeoutMs: 20_000 });
      expectClean(thumb);
      expect(Math.max(inspectJpeg(thumb).width, inspectJpeg(thumb).height)).toBe(320);
    },
    TIMEOUT * 2,
  );

  it(
    '檔頭像 PNG 但內容壞掉：undecodable',
    async () => {
      const broken = makePng(40, 40).subarray(0, 60);
      await expect(processor.process(broken, { timeoutMs: 45_000 })).rejects.toMatchObject({
        code: 'undecodable',
      });
    },
    TIMEOUT,
  );
});
