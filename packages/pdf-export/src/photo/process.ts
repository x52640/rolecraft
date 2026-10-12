/**
 * 照片處理（D28；resume-output「照片」）：原始 JPEG／PNG → 重新編碼 JPEG、最長邊 ≤ PHOTO_MAX_EDGE_PX、
 * 去掉全部中繼資料，另出一張縮圖。不只信編碼器：Chrome 輸出後一律再清除一次（stripJpegMetadata），
 * 再驗「結果沒有任何中繼資料段、尺寸符合」，不符就拒絕、不交出去。逾時就中止 Chrome 並放棄。
 */
import { PHOTO_MAX_EDGE_PX, PHOTO_THUMBNAIL_MAX_BYTES } from '@rolecraft/contracts';

import { findChrome } from '../render/chrome.ts';
import { PhotoProcessError } from './errors.ts';
import { inspectJpeg, metadataProblems, stripJpegMetadata } from './jpeg.ts';
import { createChromePhotoRenderer, type PhotoRenderer, type RenderedImage } from './render.ts';
import { inspectPhotoSource } from './source.ts';

/** 存檔用 JPEG 品質。 */
export const PHOTO_JPEG_QUALITY = 0.9;
/** 縮圖最長邊與品質：遠小於 PHOTO_THUMBNAIL_MAX_BYTES。 */
export const PHOTO_THUMBNAIL_EDGE_PX = 320;
const THUMBNAIL_QUALITY = 0.8;

export interface ProcessedPhoto {
  /** 重新編碼、去中繼資料後的 JPEG */
  readonly content: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 縮圖 JPEG（同樣去中繼資料） */
  readonly thumbnail: Uint8Array;
}

export interface PhotoProcessOptions {
  /** 整個處理（含啟動 Chrome）的時限；超過就中止並丟 PhotoProcessError('timeout') */
  readonly timeoutMs: number;
}

export interface PhotoProcessor {
  /** 使用者選的原始照片 → 存檔用照片＋縮圖 */
  process(source: Uint8Array, options: PhotoProcessOptions): Promise<ProcessedPhoto>;
  /** 已存的照片 → 縮圖（重啟後縮圖不在記憶體時用） */
  thumbnail(stored: Uint8Array, options: PhotoProcessOptions): Promise<Uint8Array>;
}

export interface PhotoProcessorDeps {
  /** 測試替換：不開 Chrome */
  readonly renderer?: PhotoRenderer;
  /** 測試替換：找瀏覽器 */
  readonly findBrowser?: () => Promise<string | null>;
}

async function withDeadline<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) {
  if (!(timeoutMs > 0)) throw new PhotoProcessError('timeout', '照片處理逾時');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PhotoProcessError('timeout', '照片處理逾時'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** 解 base64 → 再清除一次中繼資料 → 驗證沒有殘留、尺寸與最長邊符合。 */
export function finalizeJpeg(image: RenderedImage, maxEdge: number): Uint8Array {
  const raw = new Uint8Array(Buffer.from(image.base64, 'base64'));
  const cleaned = stripJpegMetadata(raw);
  if (metadataProblems(cleaned).length > 0) {
    throw new PhotoProcessError('metadata_left', '照片仍含中繼資料');
  }
  const info = inspectJpeg(cleaned);
  const sizeMatches = info.width === image.width && info.height === image.height;
  if (!sizeMatches || Math.max(info.width, info.height) > maxEdge) {
    throw new PhotoProcessError('browser_failed', '重新編碼的照片尺寸不符');
  }
  return cleaned;
}

function finalizeThumbnail(image: RenderedImage): Uint8Array {
  const bytes = finalizeJpeg(image, PHOTO_THUMBNAIL_EDGE_PX);
  if (bytes.length > PHOTO_THUMBNAIL_MAX_BYTES) {
    throw new PhotoProcessError('browser_failed', '縮圖過大');
  }
  return bytes;
}

const dataUri = (mime: string, bytes: Uint8Array): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

export function createPhotoProcessor(deps: PhotoProcessorDeps = {}): PhotoProcessor {
  const findBrowser = deps.findBrowser ?? (() => findChrome());

  async function renderer(): Promise<PhotoRenderer> {
    if (deps.renderer) return deps.renderer;
    const executablePath = await findBrowser();
    if (executablePath === null) {
      throw new PhotoProcessError('browser_missing', '找不到可用的 Chrome');
    }
    return createChromePhotoRenderer(executablePath);
  }

  async function render(mime: string, bytes: Uint8Array, timeoutMs: number) {
    return withDeadline(timeoutMs, async (signal) =>
      (await renderer())(
        {
          dataUri: dataUri(mime, bytes),
          maxEdge: PHOTO_MAX_EDGE_PX,
          quality: PHOTO_JPEG_QUALITY,
          thumbnailEdge: PHOTO_THUMBNAIL_EDGE_PX,
          thumbnailQuality: THUMBNAIL_QUALITY,
        },
        { timeoutMs, signal },
      ),
    );
  }

  return {
    async process(source, { timeoutMs }) {
      const info = inspectPhotoSource(source);
      const rendered = await render(`image/${info.format}`, source, timeoutMs);
      return {
        content: finalizeJpeg(rendered.photo, PHOTO_MAX_EDGE_PX),
        width: rendered.photo.width,
        height: rendered.photo.height,
        thumbnail: finalizeThumbnail(rendered.thumbnail),
      };
    },
    async thumbnail(stored, { timeoutMs }) {
      const rendered = await render('image/jpeg', stored, timeoutMs);
      return finalizeThumbnail(rendered.thumbnail);
    },
  };
}
