import { z } from 'zod';

import { ContentHash, Id, NonEmptyText, Timestamp } from './common.ts';

/** 授權狀態（architecture.md SourceDocument）。 */
export const AuthorizationStatus = z.enum([
  'pending', // 待確認
  'authorized', // 已授權
  'revoked', // 已撤銷
]);
export type AuthorizationStatus = z.infer<typeof AuthorizationStatus>;

/**
 * 來源文件。路徑只存在本機輔助程式內部，橋接 schema 不得出現（R7）。
 */
export const SourceDocument = z.strictObject({
  id: Id,
  /** 所屬資料夾 */
  folderPath: NonEmptyText,
  /** 文件路徑 */
  documentPath: NonEmptyText,
  /** 內容雜湊 */
  contentHash: ContentHash,
  /** 內容版本，每次內容變更遞增 */
  contentVersion: z.int().min(1),
  authorizationStatus: AuthorizationStatus,
  importedAt: Timestamp,
});
export type SourceDocument = z.infer<typeof SourceDocument>;
