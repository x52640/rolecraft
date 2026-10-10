/**
 * sources 的對外型別與檔案存取埠（port）。
 *
 * 列舉／篩選／授權集合／讀檔紀錄的邏輯（registry）不碰檔案系統，
 * 實際存取由 FolderAccess 注入：本機 fs 版（node-folder-access.ts），
 * 或日後「瀏覽器讀內容、送資料給 helper」的版本（P1-T013 決定）。
 */
import type { AuthorizationStatus } from '@rolecraft/contracts';

/** 資料夾中一個項目的種類。只有 file 可能成為候選文件。 */
export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

/** 列舉結果的一筆：只有相對路徑、大小、種類（R4「只列檔名、大小、類型」）。 */
export interface RawEntry {
  /** 以 `/` 分隔、相對於資料夾根的路徑；registry 會再驗證格式。 */
  readonly relPath: string;
  readonly kind: EntryKind;
  readonly size: number;
}

/** 安全讀取被拒的原因。 */
export type ReadRejection =
  | 'not_found'
  | 'not_regular_file'
  | 'symlink'
  | 'outside_folder'
  | 'path_changed'
  | 'too_large'
  | 'binary_content'
  | 'type_mismatch'
  | 'invalid_path'
  | 'not_authorized'
  | 'unknown_item'
  | 'folder_removed'
  | 'io_error';

export type AccessReadResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: ReadRejection };

/**
 * 單一已選資料夾的存取能力。實作必須：
 * - list：不跟隨符號連結（symlink 以 kind 'symlink' 回報、不進入）。
 * - read：只讀一般檔、不跟隨符號連結、讀時確認實際路徑仍在資料夾內、
 *   大小不超過 maxBytes；任何不符回傳 ok:false，不得丟出內容。
 */
export interface FolderAccess {
  list(): Promise<readonly RawEntry[]>;
  read(relPath: string, maxBytes: number): Promise<AccessReadResult>;
}

/** 列舉後判定不能成為候選文件的原因。 */
export type ExclusionReason =
  | 'invalid_path'
  | 'not_regular_file'
  | 'symlink'
  | 'hidden'
  | 'excluded_directory'
  | 'credential'
  | 'source_code'
  | 'not_text_document'
  | 'too_large';

/** 預覽中的一筆候選文件。內容只有在 authorized 後才會被讀。 */
export interface SourceItem {
  /** 讀檔介面唯一接受的識別。 */
  readonly id: string;
  readonly folderId: string;
  readonly relPath: string;
  readonly size: number;
  /** 文件優先序，數字越小越優先。 */
  readonly priority: number;
  readonly status: AuthorizationStatus;
  /** 最近一次列舉時是否還在。 */
  readonly present: boolean;
}

/** 被篩掉的項目，只供預覽說明，不可授權。 */
export interface ExcludedEntry {
  readonly relPath: string;
  readonly reason: ExclusionReason;
}

export interface FolderSummary {
  readonly id: string;
  readonly label: string;
  readonly excluded: readonly ExcludedEntry[];
}

/** 每次成功讀取的紀錄（R4：路徑、時間、內容雜湊）。只含授權集合內的項目。 */
export interface ReadLogEntry {
  readonly itemId: string;
  readonly folderId: string;
  readonly relPath: string;
  readonly readAt: string;
  /** sha256 hex。 */
  readonly contentHash: string;
}

/** 被拒絕的讀取嘗試，供提示使用者；與讀檔紀錄分開，沒有讀到任何內容。 */
export interface ReadRejectionNotice {
  readonly itemId: string;
  readonly relPath: string | null;
  readonly at: string;
  readonly reason: ReadRejection;
}

export type ReadResult =
  | { readonly ok: true; readonly text: string; readonly contentHash: string }
  | { readonly ok: false; readonly reason: ReadRejection };
