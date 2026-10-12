// 原始照片檔頭檢查的對抗審查重現（P1-T083）：不帶長度的標記不能被當成帶長度段落，
// 否則可在跳到的位置藏假 SOF，讓尺寸檢查看到小圖、解碼器卻解巨圖。
import { describe, expect, it, vi } from 'vitest';

import { PhotoProcessError } from './errors.ts';
import { concat, legacyJpegSize, makeJpeg, segment, smuggleFakeSof } from './jpeg.test-helpers.ts';
import { createPhotoProcessor } from './process.ts';
import type { PhotoRenderer } from './render.ts';
import { inspectPhotoSource, PHOTO_SOURCE_MAX_PIXELS } from './source.ts';

function codeOf(bytes: Uint8Array): string | undefined {
  try {
    inspectPhotoSource(bytes);
  } catch (error) {
    return error instanceof PhotoProcessError ? error.code : 'other';
  }
  return undefined;
}

const sof = (width: number, height: number) =>
  segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);

describe('inspectPhotoSource：不帶長度的標記', () => {
  const huge = makeJpeg({ width: 20_000, height: 20_000 });

  it('RST 開頭、跳到的位置藏 16×16 假 SOF：讀到真的 20000×20000 並拒絕', () => {
    const smuggled = smuggleFakeSof(huge, { width: 16, height: 16 });
    // fixture 有效：修正前的邏輯真的會讀到假尺寸
    expect(legacyJpegSize(smuggled)).toEqual({ width: 16, height: 16 });
    expect(codeOf(smuggled)).toBe('too_large');
  });

  it('各個 RST（D0–D7）與 TEM（01）都只前進 2 位元組', () => {
    for (const marker of [0xd0, 0xd3, 0xd7, 0x01]) {
      const smuggled = smuggleFakeSof(huge, { width: 16, height: 16 }, marker);
      expect(legacyJpegSize(smuggled)).toEqual({ width: 16, height: 16 });
      expect(codeOf(smuggled)).toBe('too_large');
      const small = smuggleFakeSof(
        makeJpeg({ width: 300, height: 200 }),
        { width: 1, height: 1 },
        marker,
      );
      expect(legacyJpegSize(small)).toEqual({ width: 1, height: 1 });
      expect(inspectPhotoSource(small)).toEqual({ format: 'jpeg', width: 300, height: 200 });
    }
  });

  it('掃描開始前有第二個 SOF、不認得的標記、沒有 SOF 就開始掃描：拒絕', () => {
    expect(codeOf(makeJpeg({ width: 16, height: 16, extra: [sof(20_000, 20_000)] }))).toBe(
      'undecodable',
    );
    expect(codeOf(makeJpeg({ width: 16, height: 16, extra: [segment(0xde, [0, 0, 0, 0])] }))).toBe(
      'undecodable',
    );
    const noSof = concat(Uint8Array.from([0xff, 0xd8]), segment(0xda, [1, 1, 0, 0, 63, 0]));
    expect(codeOf(noSof)).toBe('undecodable');
  });

  it('正常的 APPn、COM、DQT、DHT、DRI 照常通過', () => {
    const ok = makeJpeg({
      width: 640,
      height: 480,
      extra: [segment(0xe1, 'Exif\0\0'), segment(0xfe, 'c'), segment(0xdd, [0, 4])],
    });
    expect(inspectPhotoSource(ok)).toEqual({ format: 'jpeg', width: 640, height: 480 });
  });
});

describe('第二道防線：交給重繪器的檔頭尺寸與像素上限', () => {
  it('重繪器收到檔頭讀到的尺寸與上限，讓 Chrome 解碼前比對', async () => {
    const renderer = vi.fn<PhotoRenderer>(() =>
      Promise.reject(new PhotoProcessError('too_large', 'x')),
    );
    await createPhotoProcessor({ renderer })
      .process(makeJpeg({ width: 300, height: 200 }), { timeoutMs: 1000 })
      .catch(() => undefined);
    expect(renderer.mock.calls[0]?.[0]).toMatchObject({
      expectedWidth: 300,
      expectedHeight: 200,
      maxPixels: PHOTO_SOURCE_MAX_PIXELS,
    });
  });
});
