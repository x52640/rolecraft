import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';
import { fileStoreInternals, type FileStore } from '../files/file-store.ts';

/**
 * PDF 檔的刪除（只在 storage 內部）。PDF 內容定址，多個匯出版本可共用同一檔，
 * 所以刪之前一律先查 export_versions 還有沒有引用。
 */

/**
 * 會刪或寫 PDF 檔的操作不能放在外層交易裡：檔案操作無法隨交易回滾。
 * 外層交易若回滾，資料列回來了檔案卻沒了（或反過來留下孤兒檔），所以直接拒絕。
 */
export function assertNotInTransaction(db: DatabaseSync, operation: string): void {
  if (db.isTransaction) throw new StorageError(`${operation}不能在外層交易中呼叫（會動到檔案）`);
}

/** PDF 雜湊是否還被任何匯出版本引用。 */
export function isPdfReferenced(db: DatabaseSync, pdfHash: string): boolean {
  return (
    db.prepare('SELECT 1 FROM export_versions WHERE pdf_hash = ? LIMIT 1').get(pdfHash) !==
    undefined
  );
}

/**
 * 刪掉不再被任何匯出版本引用的 PDF 檔。每個雜湊都會嘗試，失敗的收集起來最後一起拋，
 * 不會因第一個失敗就留下後面的檔案。回傳實際刪除的雜湊。
 */
export function releasePdfs(db: DatabaseSync, fileStore: FileStore, hashes: string[]): string[] {
  const files = fileStoreInternals(fileStore);
  const released: string[] = [];
  const failures: unknown[] = [];
  for (const hash of new Set(hashes)) {
    try {
      if (!isPdfReferenced(db, hash) && files.delete(hash)) released.push(hash);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new StorageError(`有 ${failures.length} 個 PDF 檔刪除失敗；下次清掃會再試`, {
      cause: new AggregateError(failures),
    });
  }
  return released;
}

/**
 * 孤兒 PDF 清掃：刪掉檔案區中雜湊不在 export_versions 的檔案。
 * 補救「交易已提交但刪檔失敗／程序中斷」留下的檔案。不能在外層交易中呼叫。
 * 前提：單一程序使用資料庫（create 的「寫檔→寫列」是同步的，中間不會被清掃插入）。
 */
export function sweepOrphanPdfs(db: DatabaseSync, fileStore: FileStore): string[] {
  assertNotInTransaction(db, '清掃孤兒 PDF');
  const orphans = fileStoreInternals(fileStore)
    .listHashes()
    .filter((hash) => !isPdfReferenced(db, hash));
  return releasePdfs(db, fileStore, orphans);
}
