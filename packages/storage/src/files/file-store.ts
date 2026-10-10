import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { StorageError } from '../errors.ts';
import { sha256Hex } from '../ids.ts';

/**
 * 檔案儲存區（PDF 等二進位檔）。以內容 SHA-256 定址：同內容只存一份，
 * 資料庫只記雜湊（例如 ExportVersion.pdfHash），不記路徑。
 * 公開介面沒有刪除：同內容的 PDF 共用一個檔，任意刪除可能刪到已投遞版本的 PDF（R3）。
 * 刪檔只能經 storage 內部先查引用的路徑（releasePdfs、孤兒清掃），見 `fileStoreInternals`。
 */
export interface FileStore {
  /** 存入內容，回傳雜湊；已存在則不重寫 */
  put(content: Uint8Array): StoredFile;
  /** 取出內容；不存在回傳 null；內容與雜湊不符拋 StorageError */
  get(hash: string): Uint8Array | null;
  has(hash: string): boolean;
}

/** storage 內部才用得到的操作（不從 index.ts 匯出）。 */
export interface FileStoreInternals {
  delete(hash: string): boolean;
  /** 列出儲存區內所有檔案的雜湊 */
  listHashes(): string[];
}

const internals = new WeakMap<FileStore, FileStoreInternals>();

/** 取得 createLocalFileStore 建立的儲存區的內部操作；不是它建立的拋 StorageError。 */
export function fileStoreInternals(store: FileStore): FileStoreInternals {
  const found = internals.get(store);
  if (!found) throw new StorageError('檔案儲存區必須由 createLocalFileStore 建立');
  return found;
}

export interface StoredFile {
  hash: string;
  byteLength: number;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** 本機資料夾實作：`<root>/sha256/<前兩字>/<雜湊>`，寫入先寫暫存檔再改名，避免半個檔。 */
export function createLocalFileStore(root: string): FileStore {
  function pathOf(hash: string): string {
    // 雜湊格式檢查同時防止路徑穿越
    if (!HASH_PATTERN.test(hash)) throw new StorageError(`不合規的檔案雜湊：${hash}`);
    return path.join(root, 'sha256', hash.slice(0, 2), hash);
  }

  const store: FileStore = {
    put(content) {
      const hash = sha256Hex(content);
      const target = pathOf(hash);
      if (!existsSync(target)) {
        mkdirSync(path.dirname(target), { recursive: true });
        const temp = `${target}.${randomUUID()}.tmp`;
        writeFileSync(temp, content, { flag: 'wx' });
        renameSync(temp, target);
      }
      return { hash, byteLength: content.byteLength };
    },
    get(hash) {
      const target = pathOf(hash);
      if (!existsSync(target)) return null;
      const content = new Uint8Array(readFileSync(target));
      if (sha256Hex(content) !== hash) {
        throw new StorageError(`檔案內容與雜湊不符（可能被外部修改）：${hash}`);
      }
      return content;
    },
    has(hash) {
      return existsSync(pathOf(hash));
    },
  };
  internals.set(store, {
    delete(hash) {
      const target = pathOf(hash);
      if (!existsSync(target)) return false;
      rmSync(target);
      return true;
    },
    listHashes() {
      const base = path.join(root, 'sha256');
      if (!existsSync(base)) return [];
      return readdirSync(base)
        .flatMap((dir) => readdirSync(path.join(base, dir)))
        .filter((name) => HASH_PATTERN.test(name))
        .sort();
    },
  });
  return store;
}
