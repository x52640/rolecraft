import type { DatabaseSync } from 'node:sqlite';

import { ApplicationRecord } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';
import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
  readExportVersion,
} from '../export/export-version-repository.ts';
import { assertNotInTransaction } from '../export/pdf-cleanup.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import type { FileStore } from '../files/file-store.ts';
import { newId } from '../ids.ts';
import { decode, encode } from '../repositories/json-table.ts';
import { transaction } from '../transaction.ts';
import { deletedMaterialsHeldBy } from './materials.ts';
import { processPendingPdfDeletions, recordPendingPdfDeletions } from './pending-pdf-deletions.ts';

/**
 * 投遞紀錄（F09、R3）：實際投出版本只能指向不可變的匯出版本，建立後不能改指向
 * （資料庫觸發器也擋）。D19：可整筆刪除。
 */

export type ApplicationRecordInput = Omit<ApplicationRecord, 'id'>;
/** 可修改的欄位：起因、日期、狀態；exportVersionId 不可改。 */
export type ApplicationRecordChanges = Partial<
  Pick<ApplicationRecord, 'initiation' | 'appliedAt' | 'status'>
>;

export interface ApplicationRecordDeletion {
  deleted: boolean;
  /** 投遞紀錄刪除後不再被投遞、且含已刪素材副本而一併刪除的匯出版本 */
  purgedExportVersionIds: string[];
  releasedPdfHashes: string[];
}

export interface ApplicationRecordRepository {
  /** 指向的匯出版本必須存在，否則拋 StorageError */
  create(input: ApplicationRecordInput): ApplicationRecord;
  get(id: string): ApplicationRecord | null;
  /** 依投遞日期、ID 排序 */
  list(): ApplicationRecord[];
  listByExportVersion(exportVersionId: string): ApplicationRecord[];
  update(id: string, changes: ApplicationRecordChanges): ApplicationRecord;
  /**
   * 整筆刪除（D19）。若該匯出版本因此不再被投遞、且保存了使用者已刪素材的副本，
   * 依「未投遞整份刪除」一併刪除匯出版本與不再被引用的 PDF。不能在外層交易中呼叫。
   */
  delete(id: string): ApplicationRecordDeletion;
}

const where = (id: unknown) => `application_records[${String(id)}]`;

export function readApplicationRecord(db: DatabaseSync, id: string): ApplicationRecord | null {
  const row = db.prepare('SELECT data FROM application_records WHERE id = ?').get(id);
  return row ? decode(ApplicationRecord, row.data, where(id)) : null;
}

function listWhere(db: DatabaseSync, condition: string, ...params: string[]): ApplicationRecord[] {
  return db
    .prepare(
      `SELECT id, data FROM application_records${condition ? ` WHERE ${condition}` : ''} ORDER BY applied_at, id`,
    )
    .all(...params)
    .map((row) => decode(ApplicationRecord, row.data, where(row.id)));
}

export function createApplicationRecordRepository(
  db: DatabaseSync,
  fileStore: FileStore,
): ApplicationRecordRepository {
  assertImmutabilityGuards(db);
  return {
    create(input) {
      const { value, json } = encode(ApplicationRecord, { ...input, id: newId() });
      if (!readExportVersion(db, value.exportVersionId)) {
        throw new StorageError(`投遞紀錄只能指向既有的匯出版本：${value.exportVersionId}`);
      }
      db.prepare(
        `INSERT INTO application_records (id, export_version_id, applied_at, data)
         VALUES (?, ?, ?, ?)`,
      ).run(value.id, value.exportVersionId, value.appliedAt, json);
      return value;
    },
    get: (id) => readApplicationRecord(db, id),
    list: () => listWhere(db, ''),
    listByExportVersion: (exportVersionId) =>
      listWhere(db, 'export_version_id = ?', exportVersionId),
    update(id, changes) {
      const current = readApplicationRecord(db, id);
      if (!current) throw new StorageError(`找不到投遞紀錄：${id}`);
      const { initiation, appliedAt, status } = changes;
      const { value, json } = encode(ApplicationRecord, {
        ...current,
        ...(initiation === undefined ? {} : { initiation }),
        ...(appliedAt === undefined ? {} : { appliedAt }),
        ...(status === undefined ? {} : { status }),
      });
      db.prepare('UPDATE application_records SET applied_at = ?, data = ? WHERE id = ?').run(
        value.appliedAt,
        json,
        id,
      );
      return value;
    },
    delete(id) {
      assertNotInTransaction(db, '刪除投遞紀錄');
      const result = transaction(db, () => {
        const record = readApplicationRecord(db, id);
        if (!record) return { deleted: false, purgedExportVersionIds: [], pdfHashes: [] };
        db.prepare('DELETE FROM application_records WHERE id = ?').run(id);
        const version = readExportVersion(db, record.exportVersionId);
        const purge =
          version !== null &&
          !isExportVersionApplied(db, version.id) &&
          deletedMaterialsHeldBy(db, version).length > 0;
        if (!purge) return { deleted: true, purgedExportVersionIds: [], pdfHashes: [] };
        const pdfHash = deleteUnappliedExportVersion(db, version.id);
        const pdfHashes = pdfHash === null ? [] : [pdfHash];
        recordPendingPdfDeletions(db, pdfHashes);
        return { deleted: true, purgedExportVersionIds: [version.id], pdfHashes };
      });
      // 提交後只清這次釋出的 PDF；刪不掉的留在待刪紀錄，啟動清掃重試並擋啟動（不讓這次刪除失敗）
      const { pdfHashes, ...deletion } = result;
      const { released } = processPendingPdfDeletions(db, fileStore, pdfHashes);
      return { ...deletion, releasedPdfHashes: released };
    },
  };
}
