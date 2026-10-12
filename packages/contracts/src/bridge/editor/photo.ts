import { z } from 'zod';

import { Photo } from '../../entities/photo.ts';
import { Ack, EmptyPayload, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * photo.*：匯出用的目前照片（D28；resume-output「照片」，P1-T083 實作）。
 * 檔案只能由 helper 開系統選取器選（R7）：請求沒有路徑，回應只有照片資訊與縮圖。
 * photo.pick 是選取器操作（BRIDGE_PICKER_OPERATIONS，長逾時）；客戶端逾時不會取消 helper 的工作，
 * 所以 photo.* 失敗或逾時後，編輯器一律重新讀 photo.get（W19）。
 */

/** 縮圖原始位元組上限：base64 後約 342 KiB，讓 photo.get／photo.pick 回應低於 1 MiB。 */
export const PHOTO_THUMBNAIL_MAX_BYTES = 256 * 1024;

const MAX_THUMBNAIL_BASE64 = Math.ceil(PHOTO_THUMBNAIL_MAX_BYTES / 3) * 4;

/** 縮圖：JPEG 的 base64（不是 data URI）。 */
export const PhotoThumbnail = z.strictObject({
  mimeType: z.literal('image/jpeg'),
  base64: z.base64().min(1).max(MAX_THUMBNAIL_BASE64),
});
export type PhotoThumbnail = z.infer<typeof PhotoThumbnail>;

/** 照片資訊＋縮圖。 */
export const PhotoView = z.strictObject({ photo: Photo, thumbnail: PhotoThumbnail });
export type PhotoView = z.infer<typeof PhotoView>;

export const PHOTO_SCHEMAS = {
  /**
   * helper 開系統選取器（只限 JPEG／PNG、10 MB 以下），重新編碼、去中繼資料後即設為目前照片；
   * 已有照片時是更換（同一交易刪舊加新，套 D19）。取消回 cancelled；已有選取視窗開著回 busy。
   */
  'photo.pick': {
    request: bridgeOp('photo.pick', EmptyPayload),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        selection: z.discriminatedUnion('status', [
          z.strictObject({
            status: z.literal('selected'),
            photo: Photo,
            thumbnail: PhotoThumbnail,
          }),
          z.strictObject({ status: z.literal('cancelled') }),
          z.strictObject({ status: z.literal('busy') }),
        ]),
      }),
    ),
  },
  /** 目前照片資訊＋縮圖；沒有照片為 null。 */
  'photo.get': {
    request: bridgeOp('photo.get', EmptyPayload),
    response: withFailure(z.strictObject({ ok: z.literal(true), current: PhotoView.nullable() })),
  },
  /** 刪除目前照片，套 D19（含這張照片、未投遞的匯出版本整份刪除，已投遞的保留）。 */
  'photo.remove': {
    request: bridgeOp('photo.remove', EmptyPayload),
    response: withFailure(Ack),
  },
} as const;
