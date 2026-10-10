// 專案資料夾與授權集合（sources.*）handler 用的服務介面（P1-T021，F03、R4）。
// 介面只收 schema 驗證過的 ID，不接受也不回傳路徑、指令或模型設定（R7）。
// 方法是選用的：服務沒接上某個方法時，該操作回 not_implemented，不偽造成功
// （例如資料夾選取器尚未接上時，只有 sources.pick_folders 回 not_implemented）。
import type { SourceEntry, SourceRoot, SourceRootView } from '@rolecraft/contracts';

export type PickFoldersResult =
  | { readonly status: 'selected'; readonly roots: SourceRoot[] }
  | { readonly status: 'cancelled' }
  /** 已有一個選取器開著；不同時開第二個。 */
  | { readonly status: 'busy' };

export type PreviewResult =
  | { readonly status: 'ok'; readonly entries: SourceEntry[] }
  | { readonly status: 'unknown_root' }
  /** 資料夾已無法列舉（例如被換掉或刪除），請使用者移除後重新選取。 */
  | { readonly status: 'unreadable' };

export type UpdateAuthorizationResult = 'ok' | 'unknown_root' | 'invalid_entry';

export interface SourcesService {
  /** 開系統資料夾選取器（ADR-0003）；完整路徑只留在 helper。 */
  pickFolders?(): Promise<PickFoldersResult>;
  listFolders?(): SourceRootView[];
  /** 重新列舉（只列不讀）；新候選為待確認。 */
  preview?(rootId: string): Promise<PreviewResult>;
  /** 只接受該資料夾最近一次預覽回過的文件項目。 */
  updateAuthorization?(
    rootId: string,
    authorize: readonly string[],
    revoke: readonly string[],
  ): UpdateAuthorizationResult;
  /** 移除資料夾；不存在回 false。 */
  removeFolder?(rootId: string): boolean;
}
