import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';

/**
 * 專案包含哪些文件（P1-T063，D23）：每份來源文件至多屬一個專案（主鍵擋重複）。
 * 專案刪除時資料庫一併移除（ON DELETE CASCADE）。
 */
export interface ProjectDocumentRepository {
  /** 文件所屬專案；不屬任何專案回 null */
  projectOf(sourceDocumentId: string): string | null;
  /** 專案包含的文件（依加入順序） */
  listByProject(projectId: string): string[];
  /** 全部歸屬：文件 ID → 專案 ID */
  all(): Map<string, string>;
  /** 把文件加入專案；文件已屬任何專案就拋錯（呼叫端應先檢查，交易會整筆回滾） */
  add(projectId: string, sourceDocumentId: string): void;
  /** 把一個專案的全部文件移到另一個專案（合併用） */
  moveAll(fromProjectId: string, toProjectId: string): void;
}

function text(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== 'string') throw new StorageError(`project_documents：${name} 欄不合法`);
  return value;
}

export function createProjectDocumentRepository(db: DatabaseSync): ProjectDocumentRepository {
  return {
    projectOf(sourceDocumentId) {
      const row = db
        .prepare('SELECT project_id FROM project_documents WHERE source_document_id = ?')
        .get(sourceDocumentId);
      return row ? text(row, 'project_id') : null;
    },
    listByProject(projectId) {
      return db
        .prepare(
          'SELECT source_document_id FROM project_documents WHERE project_id = ? ORDER BY rowid',
        )
        .all(projectId)
        .map((row) => text(row, 'source_document_id'));
    },
    all() {
      const rows = db
        .prepare('SELECT source_document_id, project_id FROM project_documents ORDER BY rowid')
        .all();
      return new Map(rows.map((row) => [text(row, 'source_document_id'), text(row, 'project_id')]));
    },
    add(projectId, sourceDocumentId) {
      db.prepare(
        'INSERT INTO project_documents (source_document_id, project_id) VALUES (?, ?)',
      ).run(sourceDocumentId, projectId);
    },
    moveAll(fromProjectId, toProjectId) {
      db.prepare('UPDATE project_documents SET project_id = ? WHERE project_id = ?').run(
        toProjectId,
        fromProjectId,
      );
    },
  };
}
