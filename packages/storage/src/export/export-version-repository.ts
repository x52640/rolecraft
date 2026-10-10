import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';
import type { FileStore } from '../files/file-store.ts';
import { newId, nowTimestamp } from '../ids.ts';
import { deletedMaterialsHeldBy } from '../application/materials.ts';
import { decode, encode } from '../repositories/json-table.ts';
import { assertImmutabilityGuards } from './guards.ts';
import { assertNotInTransaction, releasePdfs } from './pdf-cleanup.ts';

/**
 * 不可變的匯出版本（R3）。只有新增與讀取，沒有修改；資料庫觸發器另外擋 UPDATE 與同 ID 重建。
 * 刪除只走 D19 規則（未投遞才可刪），見 `deleteUnappliedExportVersion`。
 */

/** 新建時由呼叫端提供的內容；ID、時間、PDF 雜湊、來源文件清單由 storage 產生。 */
export type ExportVersionInput = Omit<
  ExportVersion,
  'id' | 'exportedAt' | 'pdfHash' | 'sourceDocumentIds'
>;

export interface ExportVersionRepository {
  /**
   * 存 PDF 檔並新增匯出版本；sourceDocumentIds 依匯出當下引用事實項的依據計算。
   * 內容含使用者已刪除的素材（D19）時拋 StorageError、不寫檔。不能在外層交易中呼叫
   * （外層回滾時已寫的 PDF 無法跟著回滾）。
   */
  create(input: ExportVersionInput, pdf: Uint8Array): ExportVersion;
  get(id: string): ExportVersion | null;
  /** 依匯出時間、ID 排序 */
  list(): ExportVersion[];
  listByResumeVersion(resumeVersionId: string): ExportVersion[];
  /** 是否被任何投遞紀錄引用 */
  isApplied(id: string): boolean;
  /** 讀出 PDF；檔案遺失或內容與雜湊不符拋 StorageError */
  readPdf(version: ExportVersion): Uint8Array;
}

const where = (id: unknown) => `export_versions[${String(id)}]`;

export function readExportVersion(db: DatabaseSync, id: string): ExportVersion | null {
  const row = db.prepare('SELECT data FROM export_versions WHERE id = ?').get(id);
  return row ? decode(ExportVersion, row.data, where(id)) : null;
}

function listWhere(db: DatabaseSync, condition: string, ...params: string[]): ExportVersion[] {
  return db
    .prepare(
      `SELECT id, data FROM export_versions${condition ? ` WHERE ${condition}` : ''} ORDER BY exported_at, id`,
    )
    .all(...params)
    .map((row) => decode(ExportVersion, row.data, where(row.id)));
}

/** 匯出當下，引用事實項的依據來自哪些來源文件（P1-T006 的 claim_sources）。 */
function citedSourceDocumentIds(db: DatabaseSync, claimIds: string[]): string[] {
  const query = db.prepare('SELECT source_document_id FROM claim_sources WHERE claim_id = ?');
  const ids = new Set<string>();
  for (const claimId of claimIds) {
    for (const row of query.all(claimId)) ids.add(String(row.source_document_id));
  }
  return [...ids].sort();
}

export function isExportVersionApplied(db: DatabaseSync, id: string): boolean {
  return (
    db.prepare('SELECT 1 FROM application_records WHERE export_version_id = ? LIMIT 1').get(id) !==
    undefined
  );
}

/**
 * 刪除未投遞的匯出版本（D19）。已投遞拋 StorageError（資料庫觸發器也會擋）。
 * 回傳被刪版本的 PDF 雜湊；檔案要等交易提交後由呼叫端用 `releasePdfs`（pdf-cleanup.ts）清。
 */
export function deleteUnappliedExportVersion(db: DatabaseSync, id: string): string | null {
  const version = readExportVersion(db, id);
  if (!version) return null;
  if (isExportVersionApplied(db, id)) {
    throw new StorageError(`匯出版本 ${id} 已被投遞紀錄引用，不能刪除`);
  }
  db.prepare('DELETE FROM export_versions WHERE id = ?').run(id);
  return version.pdfHash;
}

export function createExportVersionRepository(
  db: DatabaseSync,
  fileStore: FileStore,
): ExportVersionRepository {
  assertImmutabilityGuards(db);
  return {
    create(input, pdf) {
      assertNotInTransaction(db, '建立匯出版本');
      const sourceDocumentIds = citedSourceDocumentIds(
        db,
        input.citedClaims.map((c) => c.claimId),
      );
      const deleted = deletedMaterialsHeldBy(db, { ...input, sourceDocumentIds });
      if (deleted.length > 0) {
        const list = deleted.map((ref) => `${ref.kind}:${ref.id}`).join('、');
        throw new StorageError(`匯出內容含使用者已刪除的素材，不能建立匯出版本：${list}`);
      }
      const stored = fileStore.put(pdf);
      const candidate: ExportVersion = {
        ...input,
        id: newId(),
        exportedAt: nowTimestamp(),
        pdfHash: stored.hash,
        sourceDocumentIds,
      };
      try {
        const { value, json } = encode(ExportVersion, candidate);
        db.prepare(
          `INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(value.id, value.resumeVersionId, value.exportedAt, value.pdfHash, json);
        return value;
      } catch (error) {
        releasePdfs(db, fileStore, [stored.hash]);
        throw error;
      }
    },
    get: (id) => readExportVersion(db, id),
    list: () => listWhere(db, ''),
    listByResumeVersion: (resumeVersionId) =>
      listWhere(db, 'resume_version_id = ?', resumeVersionId),
    isApplied: (id) => isExportVersionApplied(db, id),
    readPdf(version) {
      const content = fileStore.get(version.pdfHash);
      if (!content) throw new StorageError(`匯出版本 ${version.id} 的 PDF 檔遺失`);
      return content;
    },
  };
}
