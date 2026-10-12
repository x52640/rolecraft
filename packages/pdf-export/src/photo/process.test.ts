// 照片處理流程（不開 Chrome）：假重繪器故意輸出帶 EXIF／GPS 的 JPEG（模擬會漏的編碼器），
// 驗證交出去的結果仍沒有任何中繼資料——不只信編碼器。
import { PHOTO_SOURCE_MAX_BYTES } from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PhotoProcessError } from './errors.ts';
import { inspectJpeg, metadataProblems } from './jpeg.ts';
import {
  containsText,
  DEVICE_MARKER,
  EXIF_GPS,
  GPS_MARKER,
  makeJpeg,
  makePng,
  OTHER_METADATA,
  pngHeaderOnly,
} from './jpeg.test-helpers.ts';
import { createPhotoProcessor } from './process.ts';
import type { PhotoRenderer, RenderRequest } from './render.ts';
import { inspectPhotoSource } from './source.ts';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** 假重繪器：照請求縮放尺寸，輸出帶 EXIF／GPS 等中繼資料的 JPEG。 */
function leakyRenderer(source: { width: number; height: number }) {
  return vi.fn<PhotoRenderer>((request: RenderRequest) => {
    const fit = (edge: number) => {
      const scale = Math.min(1, edge / Math.max(source.width, source.height));
      return { width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
    };
    const image = (edge: number) => {
      const size = fit(edge);
      return { ...size, base64: b64(makeJpeg({ ...size, extra: [EXIF_GPS, ...OTHER_METADATA] })) };
    };
    return Promise.resolve({
      photo: image(request.maxEdge),
      thumbnail: image(request.thumbnailEdge),
    });
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof PhotoProcessError ? error.code : 'other';
  }
  return undefined;
}

describe('inspectPhotoSource', () => {
  it('看檔頭認 JPEG／PNG 並讀尺寸', () => {
    expect(inspectPhotoSource(makeJpeg({ width: 4000, height: 3000 }))).toEqual({
      format: 'jpeg',
      width: 4000,
      height: 3000,
    });
    expect(inspectPhotoSource(makePng(30, 20))).toEqual({ format: 'png', width: 30, height: 20 });
  });

  it('非 JPEG／PNG、超過 10 MB、像素過多、尺寸 0：拒絕', () => {
    const fail = (bytes: Uint8Array) => {
      try {
        inspectPhotoSource(bytes);
      } catch (error) {
        return error instanceof PhotoProcessError ? error.code : 'other';
      }
      return undefined;
    };
    expect(fail(new TextEncoder().encode('GIF89a...'))).toBe('not_image');
    expect(fail(new TextEncoder().encode('%PDF-1.7'))).toBe('not_image');
    const big = new Uint8Array(PHOTO_SOURCE_MAX_BYTES + 1);
    big.set(makeJpeg({ width: 10, height: 10 }));
    expect(fail(big)).toBe('too_large');
    expect(fail(pngHeaderOnly(20_000, 20_000))).toBe('too_large');
    expect(fail(pngHeaderOnly(0, 10))).toBe('undecodable');
    expect(fail(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe('undecodable');
  });
});

describe('createPhotoProcessor', () => {
  it('帶 EXIF／GPS 的 JPEG：結果沒有任何中繼資料、最長邊 1,200 px，縮圖也乾淨', async () => {
    const source = makeJpeg({ width: 4000, height: 3000, extra: [EXIF_GPS] });
    const renderer = leakyRenderer({ width: 4000, height: 3000 });
    const out = await createPhotoProcessor({ renderer }).process(source, { timeoutMs: 1000 });
    expect(out).toMatchObject({ width: 1200, height: 900 });
    for (const bytes of [out.content, out.thumbnail]) {
      expect(metadataProblems(bytes)).toEqual([]);
      expect(containsText(bytes, GPS_MARKER)).toBe(false);
      expect(containsText(bytes, DEVICE_MARKER)).toBe(false);
    }
    expect(inspectJpeg(out.content)).toMatchObject({ width: 1200, height: 900 });
    expect(Math.max(inspectJpeg(out.thumbnail).width, inspectJpeg(out.thumbnail).height)).toBe(320);
    const request = renderer.mock.calls[0]?.[0];
    expect(request?.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(request?.maxEdge).toBe(1200);
  });

  it('帶中繼資料的 PNG：以 image/png 交給重繪器，結果同樣乾淨', async () => {
    const renderer = leakyRenderer({ width: 30, height: 20 });
    const out = await createPhotoProcessor({ renderer }).process(makePng(30, 20), {
      timeoutMs: 1000,
    });
    expect(renderer.mock.calls[0]?.[0].dataUri.startsWith('data:image/png;base64,')).toBe(true);
    expect(out).toMatchObject({ width: 30, height: 20 });
    expect(metadataProblems(out.content)).toEqual([]);
  });

  it('重繪器輸出超過 1,200 px 或尺寸不符：拒絕', async () => {
    const tooBig: PhotoRenderer = () => {
      const image = {
        width: 1300,
        height: 900,
        base64: b64(makeJpeg({ width: 1300, height: 900 })),
      };
      return Promise.resolve({ photo: image, thumbnail: image });
    };
    const lying: PhotoRenderer = () => {
      const image = { width: 100, height: 100, base64: b64(makeJpeg({ width: 120, height: 100 })) };
      return Promise.resolve({ photo: image, thumbnail: image });
    };
    const source = makeJpeg({ width: 2000, height: 2000 });
    for (const renderer of [tooBig, lying]) {
      expect(
        await codeOf(createPhotoProcessor({ renderer }).process(source, { timeoutMs: 1000 })),
      ).toBe('browser_failed');
    }
  });

  it('解不開、非影像：拒絕，不呼叫或照實回報', async () => {
    const renderer = vi.fn<PhotoRenderer>(() =>
      Promise.reject(new PhotoProcessError('undecodable', '照片無法解讀')),
    );
    const processor = createPhotoProcessor({ renderer });
    expect(
      await codeOf(processor.process(new TextEncoder().encode('hello'), { timeoutMs: 1000 })),
    ).toBe('not_image');
    expect(renderer).not.toHaveBeenCalled();
    expect(await codeOf(processor.process(makePng(4, 4), { timeoutMs: 1000 }))).toBe('undecodable');
  });

  it('逾時：中止重繪器（signal）並丟 timeout；時限 0 直接放棄', async () => {
    let signal: AbortSignal | undefined;
    const renderer: PhotoRenderer = (_request, options) => {
      signal = options.signal;
      return new Promise(() => undefined);
    };
    const processor = createPhotoProcessor({ renderer });
    expect(await codeOf(processor.process(makePng(4, 4), { timeoutMs: 20 }))).toBe('timeout');
    expect(signal?.aborted).toBe(true);
    expect(await codeOf(processor.process(makePng(4, 4), { timeoutMs: 0 }))).toBe('timeout');
  });

  it('找不到 Chrome：browser_missing', async () => {
    const processor = createPhotoProcessor({ findBrowser: () => Promise.resolve(null) });
    expect(await codeOf(processor.process(makePng(4, 4), { timeoutMs: 1000 }))).toBe(
      'browser_missing',
    );
  });

  it('thumbnail：已存照片重產縮圖，同樣乾淨', async () => {
    const renderer = leakyRenderer({ width: 1200, height: 800 });
    const thumb = await createPhotoProcessor({ renderer }).thumbnail(
      makeJpeg({ width: 1200, height: 800 }),
      { timeoutMs: 1000 },
    );
    expect(metadataProblems(thumb)).toEqual([]);
    expect(inspectJpeg(thumb)).toMatchObject({ width: 320, height: 213 });
  });
});
