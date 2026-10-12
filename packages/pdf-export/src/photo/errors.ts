/** 照片處理失敗的固定原因（D28）；訊息是固定文字，不含照片內容或路徑。 */
export type PhotoProcessErrorCode =
  | 'not_image' // 不是 JPEG／PNG（看檔頭，不看副檔名）
  | 'too_large' // 原始檔超過 10 MB，或像素數超過上限（避免解壓炸彈）
  | 'undecodable' // 解不開，或結構不正確
  | 'metadata_left' // 重新編碼＋清除後仍驗出中繼資料（不存）
  | 'browser_missing' // 找不到已支援的 Chrome
  | 'browser_failed' // Chrome 啟動或重繪失敗
  | 'timeout'; // 超過處理時限（放棄、不寫入）

export class PhotoProcessError extends Error {
  override readonly name = 'PhotoProcessError';
  readonly code: PhotoProcessErrorCode;

  constructor(code: PhotoProcessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
