import type { DatabaseSync } from 'node:sqlite';

import { SourceDocument } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 來源文件（R4）。路徑只在本機輔助程式內部使用。 */
export interface SourceDocumentRepository {
  save(document: SourceDocument): SourceDocument;
  get(id: string): SourceDocument | null;
  list(): SourceDocument[];
  listByFolder(folderPath: string): SourceDocument[];
  delete(id: string): boolean;
}

export function createSourceDocumentRepository(db: DatabaseSync): SourceDocumentRepository {
  const table = jsonTable(db, 'source_documents', 'id', SourceDocument);
  return {
    save: (doc) =>
      table.upsert(
        {
          id: doc.id,
          folder_path: doc.folderPath,
          document_path: doc.documentPath,
          content_hash: doc.contentHash,
          content_version: doc.contentVersion,
          authorization_status: doc.authorizationStatus,
        },
        doc,
      ),
    get: (id) => table.get(id),
    list: () => table.list(),
    listByFolder: (folderPath) => table.list('folder_path = ?', folderPath),
    delete: (id) => table.delete(id),
  };
}
