/** storage 自己的錯誤：migration 不一致、資料庫內容不通過 contracts schema、檔案缺失等。 */
export class StorageError extends Error {
  override readonly name = 'StorageError';
}
