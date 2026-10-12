/**
 * 用匯出已在用的本機 Chrome（puppeteer-core，ADR-0005）重繪照片：解碼 → 畫到 canvas（白底、縮到最長邊）
 * → 重新編碼 JPEG。canvas 只有像素，原檔的 EXIF、GPS、裝置等中繼資料不會帶過去；
 * 結果仍由 process.ts 再清除並驗證，不只信編碼器。頁面只允許 data: 資源，其他請求一律中止。
 */
import puppeteer, { type Browser } from 'puppeteer-core';

import { PhotoProcessError } from './errors.ts';

export interface RenderRequest {
  /** 原始照片的 data URI（image/jpeg 或 image/png） */
  readonly dataUri: string;
  /** 檔頭讀到的尺寸（inspectPhotoSource）：Chrome 解碼前比對，不符就拒絕（第二道防線） */
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  /** 像素上限：Chrome 讀到的尺寸超過就拒絕，不解碼 */
  readonly maxPixels: number;
  readonly maxEdge: number;
  readonly quality: number;
  readonly thumbnailEdge: number;
  readonly thumbnailQuality: number;
}

export interface RenderedImage {
  /** JPEG 的 base64（不含 data: 前綴） */
  readonly base64: string;
  readonly width: number;
  readonly height: number;
}

export interface PhotoRendering {
  readonly photo: RenderedImage;
  readonly thumbnail: RenderedImage;
}

export interface RenderOptions {
  readonly timeoutMs: number;
  /** 中止時關掉瀏覽器（逾時放棄） */
  readonly signal: AbortSignal;
}

/** 可替換的重繪器：測試用假的，不開 Chrome。 */
export type PhotoRenderer = (
  request: RenderRequest,
  options: RenderOptions,
) => Promise<PhotoRendering>;

const PAGE_HTML =
  '<!doctype html><meta charset="utf-8">' +
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:">`;

/** 在頁面內執行的程式（字串：本套件不載入 DOM 型別）。 */
const PAGE_SCRIPT = `async (req) => {
  const img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = req.dataUri;
    });
  } catch { return { error: 'decode' }; }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return { error: 'decode' };
  // 解碼前比對：Chrome 看到的尺寸必須等於檔頭檢查讀到的（允許 EXIF 方向轉 90 度），且不超過上限
  if (w * h > req.maxPixels) return { error: 'too_large' };
  const same = (w === req.expectedWidth && h === req.expectedHeight)
    || (w === req.expectedHeight && h === req.expectedWidth);
  if (!same) return { error: 'size_mismatch' };
  try { await img.decode(); } catch { return { error: 'decode' }; }
  const draw = (source, sw, sh, maxEdge, quality) => {
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    const url = canvas.toDataURL('image/jpeg', quality);
    const comma = url.indexOf(',');
    return { canvas, out: { prefix: url.slice(0, comma), base64: url.slice(comma + 1), width, height } };
  };
  const main = draw(img, img.naturalWidth, img.naturalHeight, req.maxEdge, req.quality);
  const thumb = draw(main.canvas, main.out.width, main.out.height, req.thumbnailEdge, req.thumbnailQuality);
  return { photo: main.out, thumbnail: thumb.out };
}`;

interface PageImage extends RenderedImage {
  readonly prefix: string;
}

type PageResult =
  { error: 'decode' | 'too_large' | 'size_mismatch' } | { photo: PageImage; thumbnail: PageImage };

function checked(image: PageImage): RenderedImage {
  if (image.prefix !== 'data:image/jpeg;base64') {
    throw new PhotoProcessError('browser_failed', 'Chrome 沒有輸出 JPEG');
  }
  return { base64: image.base64, width: image.width, height: image.height };
}

async function renderIn(browser: Browser, request: RenderRequest, timeoutMs: number) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url().startsWith('data:')) void r.continue();
    else void r.abort('blockedbyclient');
  });
  await page.setContent(PAGE_HTML, { waitUntil: 'load' });
  const result = (await page.evaluate(
    `(${PAGE_SCRIPT})(${JSON.stringify(request)})`,
  )) as PageResult;
  if ('error' in result) {
    if (result.error === 'too_large') throw new PhotoProcessError('too_large', '照片像素過多');
    if (result.error === 'size_mismatch') {
      throw new PhotoProcessError('undecodable', '照片實際尺寸與檔頭不符');
    }
    throw new PhotoProcessError('undecodable', '照片無法解讀');
  }
  return { photo: checked(result.photo), thumbnail: checked(result.thumbnail) };
}

/** 建立用指定 Chrome 重繪的 renderer；每次呼叫都用獨立暫存 profile，結束一定關閉。 */
export function createChromePhotoRenderer(executablePath: string): PhotoRenderer {
  return async (request, { timeoutMs, signal }) => {
    if (signal.aborted) throw new PhotoProcessError('timeout', '照片處理逾時');
    let browser: Browser;
    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        timeout: timeoutMs,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-sync'],
      });
    } catch (cause) {
      throw new PhotoProcessError('browser_failed', 'Chrome 無法在背景啟動', { cause });
    }
    const close = () => void browser.close().catch(() => undefined);
    signal.addEventListener('abort', close, { once: true });
    try {
      if (signal.aborted) throw new PhotoProcessError('timeout', '照片處理逾時');
      return await renderIn(browser, request, timeoutMs);
    } catch (cause) {
      if (cause instanceof PhotoProcessError) throw cause;
      throw new PhotoProcessError('browser_failed', 'Chrome 重繪照片失敗', { cause });
    } finally {
      signal.removeEventListener('abort', close);
      await browser.close().catch(() => undefined);
    }
  };
}
