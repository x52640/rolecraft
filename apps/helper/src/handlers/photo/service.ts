// 目前照片（photo.*）handler 用的服務介面（D28；P1-T083 實作）。
// 請求沒有路徑：照片只能由 helper 開系統選取器選（R7）。照片不送模型。
// 方法皆可省略：沒接上的方法，handler 回 not_implemented，不偽造成功。
import type { PhotoView } from '@rolecraft/contracts';

/**
 * photo.pick 的結果；busy＝已有一個選取視窗開著（同時只開一個）。
 * failed＝選到的檔案不能用或處理失敗／逾時（一律沒有寫入）；訊息是固定文字。
 */
export type PhotoPickOutcome =
  | { status: 'selected'; view: PhotoView }
  | { status: 'cancelled' }
  | { status: 'busy' }
  | { status: 'failed'; code: 'invalid_request' | 'internal_error'; message: string };

export interface PhotoService {
  /** 開選取器、重新編碼去中繼資料後設為目前照片（已有照片時同一交易更換，套 D19）。 */
  pick?(): Promise<PhotoPickOutcome>;
  /** 目前照片資訊＋縮圖；沒有回 null。 */
  get?(): Promise<PhotoView | null>;
  /** 刪除目前照片（套 D19）；沒有照片也算成功。 */
  remove?(): Promise<void>;
}
