import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 資料區鎖（擁有者裁定 #13：同一資料區同時只准一個 helper）。
 *
 * 用一個專用的 SQLite 檔，開一個 `BEGIN EXCLUSIVE` 交易並一直不提交：SQLite 底層用作業系統的
 * 檔案鎖（POSIX advisory lock），持有的行程一結束（含當掉、被強制結束），作業系統就自動放鎖。
 * 所以不需要記 pid、判斷「殘留的鎖」或接手，也沒有 pid 被其他行程重用而誤判的問題。
 * 同一行程內第二個連線同樣拿不到（SQLite 自己協調同行程的連線）。
 *
 * 前提：資料區在本機檔案系統（網路磁碟的檔案鎖不可靠，不支援）。
 * 鎖檔只放鎖，不放任何資料；不要用其他方式開啟或刪除它（同行程關掉同一檔的其他檔案描述子會放掉鎖）。
 */
export const DATA_DIR_LOCK_FILE = 'rolecraft.instance.lock';

/** SQLite 的 SQLITE_BUSY：鎖被別人持有（等到 waitMs 仍拿不到） */
const SQLITE_BUSY = 5;

export interface DataDirLock {
  /** 放鎖；重複呼叫無害 */
  release(): void;
}

export interface AcquireDataDirLockOptions {
  /** 被占用時最多等多久（毫秒）再放棄；預設 0（不等）。會阻塞呼叫端，只在啟動時用短等待 */
  readonly waitMs?: number;
}

function isBusy(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errcode' in error &&
    error.errcode === SQLITE_BUSY
  );
}

/**
 * 試著取得資料區鎖。拿到回 DataDirLock；被另一個仍在執行的行程（或同行程另一個連線）持有回 null。
 * 其他錯誤（資料夾不存在、沒有權限、鎖檔被換成非 SQLite 檔等）照原樣拋出，由呼叫端當設定錯誤處理。
 */
export function tryAcquireDataDirLock(
  dataDir: string,
  options: AcquireDataDirLockOptions = {},
): DataDirLock | null {
  const waitMs = Math.max(0, Math.floor(options.waitMs ?? 0));
  const db = new DatabaseSync(path.join(dataDir, DATA_DIR_LOCK_FILE));
  try {
    db.exec(`PRAGMA busy_timeout = ${String(waitMs)}`);
    db.exec('BEGIN EXCLUSIVE');
    // 在同一交易做一次寫入：鎖檔唯讀（例如 0444）時 SQLite 以唯讀開啟，BEGIN EXCLUSIVE 仍會成功
    // 卻沒有真的取得寫入鎖，兩個 helper 會同時「拿到」。寫入在唯讀時拋 SQLITE_READONLY，照設定錯誤處理。
    db.exec('PRAGMA user_version = 1');
  } catch (error) {
    db.close();
    if (isBusy(error)) return null;
    throw error;
  }
  return {
    release() {
      // 關閉連線即放鎖（未提交的交易隨之回滾；鎖檔沒有任何資料）
      if (db.isOpen) db.close();
    },
  };
}
