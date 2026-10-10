import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { StorageError } from '../errors.ts';
import { sha256Hex } from '../ids.ts';

/**
 * 檔案儲存區（PDF 等二進位檔）。以內容 SHA-256 定址：同內容只存一份，
 * 資料庫只記雜湊（例如 ExportVersion.pdfHash），不記路徑。
 */
export interface FileStore {
  /** 存入內容，回傳雜湊；已存在則不重寫 */
  put(content: Uint8Array): StoredFile;
  /** 取出內容；不存在回傳 null；內容與雜湊不符拋 StorageError */
  get(hash: string): Uint8Array | null;
  has(hash: string): boolean;
  delete(hash: string): boolean;
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

  return {
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
    delete(hash) {
      const target = pathOf(hash);
      if (!existsSync(target)) return false;
      rmSync(target);
      return true;
    },
  };
}
