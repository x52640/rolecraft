// 目前照片服務（D28；resume-output「照片」，P1-T083）。
// pick：系統選取器（只限 JPEG／PNG、10 MB 以下）→ pdf-export 重新編碼、最長邊 1,200 px、去中繼資料
// → storage replacePhoto（已有照片時同一交易刪舊加新，套 D19）。處理必須在選取器處理餘裕內完成，
// 超過就放棄、不寫入。照片只存資料庫、只回給編輯器顯示，不進任何提示。
import {
  BRIDGE_PICKER_TIMEOUT_MS,
  PHOTO_THUMBNAIL_MAX_BYTES,
  type PhotoView,
} from '@rolecraft/contracts';
import { PhotoProcessError, type PhotoProcessor } from '@rolecraft/pdf-export';
import { PickerError, type PickedPhotoFile } from '@rolecraft/sources';
import {
  createRepositories,
  removePhoto,
  replacePhoto,
  type StoredPhoto,
} from '@rolecraft/storage';

import type { HelperStorage } from '../claims/storage-service.ts';
import type { PhotoPickOutcome, PhotoService } from './service.ts';

/** 照片選取器：只回原始內容（沒有路徑）；取消回 null。 */
export type PhotoFilePicker = () => Promise<PickedPhotoFile | null>;

/** 客戶端逾時前留的餘裕：寫入與回覆要在客戶端放棄前完成。 */
const CLIENT_MARGIN_MS = 10_000;
/** 處理上限（解碼＋重新編碼，含啟動 Chrome）：小於選取器處理餘裕（60 秒）。 */
export const PHOTO_PROCESS_TIMEOUT_MS = 45_000;
/** photo.get 重產縮圖的上限：小於一般橋接逾時（30 秒）。 */
export const PHOTO_THUMBNAIL_TIMEOUT_MS = 20_000;

export interface PhotoServiceDeps extends HelperStorage {
  readonly processor: PhotoProcessor;
  /** 沒有選取器（非 macOS）時不提供 pick（回尚未支援），get／remove 照常 */
  readonly picker?: PhotoFilePicker;
  /** 測試替換：時間來源（毫秒） */
  readonly now?: () => number;
  /** 測試替換：從收到請求起算、必須寫入完成的期限（預設選取器逾時減餘裕） */
  readonly pickBudgetMs?: number;
  readonly processTimeoutMs?: number;
}

type Failed = Extract<PhotoPickOutcome, { status: 'failed' }>;

const REJECTED: Failed = {
  status: 'failed',
  code: 'invalid_request',
  message: '照片只限 JPEG 或 PNG、10 MB 以下',
};

/** 失敗一律不寫入；訊息是固定文字，不含路徑或照片內容。 */
function failureOf(error: unknown): Failed {
  if (error instanceof PickerError) {
    if (error.reason === 'not_image' || error.reason === 'too_large') return REJECTED;
    throw error;
  }
  if (!(error instanceof PhotoProcessError)) throw error;
  switch (error.code) {
    case 'not_image':
    case 'too_large':
      return REJECTED;
    case 'undecodable':
      return { status: 'failed', code: 'invalid_request', message: '照片無法解讀，請換一張' };
    case 'timeout':
      return { status: 'failed', code: 'internal_error', message: '照片處理逾時，沒有儲存' };
    case 'browser_missing':
      return { status: 'failed', code: 'internal_error', message: '找不到 Chrome，無法處理照片' };
    default:
      return { status: 'failed', code: 'internal_error', message: '照片處理失敗，沒有儲存' };
  }
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

export function createPhotoService(deps: PhotoServiceDeps): PhotoService {
  const { db, fileStore, processor, picker } = deps;
  const photos = createRepositories(db).photos;
  const now = deps.now ?? Date.now;
  const pickBudgetMs = deps.pickBudgetMs ?? BRIDGE_PICKER_TIMEOUT_MS - CLIENT_MARGIN_MS;
  const processTimeoutMs = deps.processTimeoutMs ?? PHOTO_PROCESS_TIMEOUT_MS;
  let picking = false;
  /** 目前照片的縮圖（照片 ID 對應）；重啟後沒有，photo.get 時重產 */
  let cached: { id: string; thumbnail: Uint8Array } | null = null;

  async function thumbnailOf(stored: StoredPhoto): Promise<Uint8Array> {
    if (cached?.id === stored.photo.id) return cached.thumbnail;
    // 存下的照片已去中繼資料；夠小就直接當縮圖，不必開 Chrome
    const thumbnail =
      stored.content.length <= PHOTO_THUMBNAIL_MAX_BYTES
        ? stored.content
        : await processor.thumbnail(stored.content, { timeoutMs: PHOTO_THUMBNAIL_TIMEOUT_MS });
    cached = { id: stored.photo.id, thumbnail };
    return thumbnail;
  }

  async function pickOnce(chosen: PhotoFilePicker, deadline: number): Promise<PhotoPickOutcome> {
    let picked: PickedPhotoFile | null;
    try {
      picked = await chosen();
    } catch (error) {
      return failureOf(error);
    }
    if (!picked) return { status: 'cancelled' };
    let processed;
    try {
      const timeoutMs = Math.min(processTimeoutMs, deadline - now());
      processed = await processor.process(picked.bytes, { timeoutMs });
    } catch (error) {
      return failureOf(error);
    }
    // 處理完已超過期限：客戶端可能已放棄，放棄、不寫入
    if (now() > deadline) return failureOf(new PhotoProcessError('timeout', '照片處理逾時'));
    const { photo } = replacePhoto(db, fileStore, {
      format: 'jpeg',
      width: processed.width,
      height: processed.height,
      content: processed.content,
    });
    cached = { id: photo.id, thumbnail: processed.thumbnail };
    return {
      status: 'selected',
      view: { photo, thumbnail: { mimeType: 'image/jpeg', base64: toBase64(processed.thumbnail) } },
    };
  }

  return {
    ...(picker && {
      async pick(): Promise<PhotoPickOutcome> {
        if (picking) return { status: 'busy' };
        picking = true;
        try {
          return await pickOnce(picker, now() + pickBudgetMs);
        } finally {
          picking = false;
        }
      },
    }),

    async get(): Promise<PhotoView | null> {
      const stored = photos.get();
      if (!stored) return null;
      const thumbnail = await thumbnailOf(stored);
      return {
        photo: stored.photo,
        thumbnail: { mimeType: 'image/jpeg', base64: toBase64(thumbnail) },
      };
    },

    remove(): Promise<void> {
      removePhoto(db, fileStore);
      cached = null;
      return Promise.resolve();
    },
  };
}
