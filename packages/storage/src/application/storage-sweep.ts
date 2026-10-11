import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
} from '../export/export-version-repository.ts';
import { StorageError } from '../errors.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import { assertNotInTransaction, releasePdfs, sweepOrphanPdfs } from '../export/pdf-cleanup.ts';
import type { FileStore } from '../files/file-store.ts';
import { decode } from '../repositories/json-table.ts';
import { transaction } from '../transaction.ts';
import { deletedMaterialsHeldBy } from './materials.ts';

export interface StorageSweep {
  /** 未投遞、含已刪素材副本而補刪的匯出版本（D19） */
  purgedExportVersionIds: string[];
  /** 刪掉的孤兒 PDF（雜湊不在任何匯出版本） */
  releasedPdfHashes: string[];
}

/**
 * 只有「一般孤兒 PDF」刪不掉（擁有者裁定 #14）：補刪版本（D19）都成功，只有第 2 步的孤兒檔刪除失敗。
 * 呼叫端可記錄後照常啟動，下次清掃再試；`sweep` 是這次清掃已完成的部分（孤兒雜湊不含在內）。
 * 仍是 StorageError 的子類：沒有特別處理它的呼叫端行為不變（照樣視為清掃失敗）。
 */
export class OrphanPdfSweepError extends StorageError {
  readonly sweep: StorageSweep;

  constructor(sweep: StorageSweep, options: { cause: unknown }) {
    super('有孤兒 PDF 檔刪除失敗；下次清掃會再試', options);
    this.sweep = sweep;
  }
}

/**
 * 孤兒清掃的失敗是否只是「刪檔失敗」：releasePdfs 把每個刪檔失敗收成 AggregateError 包在 StorageError 裡。
 * 列舉檔案區失敗（讀不到資料夾等）是原始例外，不算：照樣擋啟動（保守）。
 */
function isOrphanDeleteFailure(error: unknown): boolean {
  return error instanceof StorageError && error.cause instanceof AggregateError;
}

/** 啟動清掃的孤兒 PDF 寬限期：必須大於最長匯出時間（列印逾時 30 秒＋檢查），留足餘裕。 */
export const ORPHAN_PDF_GRACE_MS = 15 * 60 * 1000;

export interface StorageSweepOptions {
  /**
   * 啟動清掃（helper 開啟資料區時）設 true：孤兒 PDF 只刪修改時間早於 ORPHAN_PDF_GRACE_MS 的，
   * 避免刪到其他 helper 行程剛寫入、尚未寫資料列的檔。補刪的匯出版本（D19）的 PDF 一律立即刪。
   */
  readonly orphanGrace?: boolean;
  /** 現在時間（毫秒）；測試可注入 */
  readonly now?: () => number;
}

/**
 * 補救清掃（D19 縱深防禦）：本機輔助程式啟動時呼叫一次。
 * 1. 未投遞、卻保存了已刪素材副本的匯出版本整份刪除（素材若被繞過 deleteMaterial 刪掉，
 *    0003 觸發器仍會記入 deleted_materials，這裡補做 D19）。
 * 2. 清掉孤兒 PDF（刪檔失敗、程序中斷留下的檔案）。
 * 第 1 步補刪版本的 PDF 刪除失敗時，該版本資料列保留（下次清掃立即重試），第 2 步仍照跑；
 * 兩步都跑完才拋合併的 StorageError（已清除素材的 PDF 刪不掉仍擋啟動，裁定 #14）。
 * 只有第 2 步的孤兒檔刪不掉時改拋 OrphanPdfSweepError（帶已完成的結果），讓啟動流程記錄後照常上線。
 * deleteMaterial 與投遞紀錄 delete 結束時也會做第 2 步。不能在外層交易中呼叫。
 */
export function sweepStorage(
  db: DatabaseSync,
  fileStore: FileStore,
  options: StorageSweepOptions = {},
): StorageSweep {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '清掃儲存區');
  // 兩段都要跑：補刪版本的 PDF 刪失敗時，孤兒清掃仍要繼續；最後再一起拋。
  const failures: unknown[] = [];
  const attempt = (stage: () => string[], into: unknown[] = failures): string[] => {
    try {
      return stage();
    } catch (error) {
      into.push(error);
      return [];
    }
  };
  const purgedIds: string[] = [];
  const released: string[] = [];
  const candidates = db.prepare('SELECT id FROM export_versions ORDER BY exported_at, id').all();
  for (const { id } of candidates) {
    const hashes = attempt(() => {
      const purged = purgeIfHoldsDeleted(db, fileStore, String(id));
      if (purged) purgedIds.push(String(id));
      return purged ?? [];
    });
    released.push(...hashes);
  }
  const orphanFailures: unknown[] = [];
  const orphans = attempt(
    () =>
      sweepOrphanPdfs(db, fileStore, {
        graceMs: options.orphanGrace === true ? ORPHAN_PDF_GRACE_MS : 0,
        ...(options.now === undefined ? {} : { now: options.now }),
      }),
    orphanFailures,
  );
  const result: StorageSweep = {
    purgedExportVersionIds: purgedIds,
    releasedPdfHashes: [...new Set([...released, ...orphans])].sort(),
  };
  const all = [...failures, ...orphanFailures];
  if (all.length === 0) return result;
  const cause = new AggregateError(all);
  if (failures.length === 0 && orphanFailures.every(isOrphanDeleteFailure)) {
    throw new OrphanPdfSweepError(result, { cause });
  }
  throw new StorageError('清掃儲存區時有 PDF 檔刪除失敗；下次清掃會再試', { cause });
}

/**
 * 一個版本一個交易：未投遞且含已刪素材 → 刪資料列，並在「提交前」刪掉不再被引用的 PDF。
 * 刪檔失敗就整個回滾、資料列保留，下次清掃仍走這條路（不套孤兒寬限期）立即重試，
 * 不會變成「列已刪、檔還在、又被寬限期跳過」（D19）。仍被其他版本共用的 PDF 不刪。
 * 回傳刪掉的 PDF 雜湊；不需補刪回 null。
 */
function purgeIfHoldsDeleted(db: DatabaseSync, fileStore: FileStore, id: string): string[] | null {
  return transaction(db, () => {
    const row = db.prepare('SELECT data FROM export_versions WHERE id = ?').get(id);
    if (!row) return null;
    const version = decode(ExportVersion, row.data, `export_versions[${id}]`);
    if (isExportVersionApplied(db, version.id)) return null;
    if (deletedMaterialsHeldBy(db, version).length === 0) return null;
    const pdfHash = deleteUnappliedExportVersion(db, version.id);
    return pdfHash === null ? [] : releasePdfs(db, fileStore, [pdfHash]);
  });
}
