import type { DatabaseSync } from 'node:sqlite';

import { assertNotInTransaction, releasePdfs } from '../export/pdf-cleanup.ts';
import type { FileStore } from '../files/file-store.ts';
import { nowTimestamp } from '../ids.ts';

/**
 * 待刪 PDF 紀錄（0004；D19、擁有者裁定 #14）。
 * 刪掉匯出版本資料列的交易裡同時記下它的 PDF 雜湊；提交後才刪檔。刪不掉的紀錄留著，
 * 啟動清掃一律立即重試（不套孤兒寬限期），失敗擋啟動。仍被匯出版本引用的 PDF 絕不刪（只移除紀錄）。
 */

/** 記下待刪的 PDF；必須在刪除資料列的同一交易內呼叫。 */
export function recordPendingPdfDeletions(db: DatabaseSync, hashes: readonly string[]): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO pending_pdf_deletions (pdf_hash, recorded_at) VALUES (?, ?)',
  );
  const at = nowTimestamp();
  for (const hash of new Set(hashes)) insert.run(hash, at);
}

export interface PendingPdfProcessing {
  /** 實際刪掉的 PDF */
  released: string[];
  /** 刪檔失敗的例外（紀錄保留，下次再試） */
  failures: unknown[];
}

/**
 * 處理待刪紀錄：給 hashes 只處理這些（刪除操作提交後只清自己釋出的檔），不給就處理全部（啟動清掃）。
 * 每筆各自嘗試；刪成功、檔已不在、或仍被引用（不刪檔）都移除紀錄；失敗保留紀錄並收集例外。
 * 不拋刪檔失敗，由呼叫端決定。不能在外層交易中呼叫。
 */
export function processPendingPdfDeletions(
  db: DatabaseSync,
  fileStore: FileStore,
  hashes?: readonly string[],
): PendingPdfProcessing {
  assertNotInTransaction(db, '刪除待刪 PDF');
  const pending = db
    .prepare('SELECT pdf_hash FROM pending_pdf_deletions ORDER BY pdf_hash')
    .all()
    .map((row) => String(row.pdf_hash));
  const wanted = hashes === undefined ? null : new Set(hashes);
  const remove = db.prepare('DELETE FROM pending_pdf_deletions WHERE pdf_hash = ?');
  const released: string[] = [];
  const failures: unknown[] = [];
  for (const hash of pending) {
    if (wanted !== null && !wanted.has(hash)) continue;
    try {
      released.push(...releasePdfs(db, fileStore, [hash]));
      remove.run(hash);
    } catch (error) {
      failures.push(error);
    }
  }
  return { released, failures };
}
