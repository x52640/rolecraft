import type { DatabaseSync } from 'node:sqlite';

import { Claim } from '@rolecraft/contracts';

import { transaction } from '../transaction.ts';
import { jsonTable } from './json-table.ts';

/** 事實項（R1、R2）。同步維護 claim_sources，供來源文件變更時反查受影響的事實項。 */
export interface ClaimRepository {
  save(claim: Claim): Claim;
  get(id: string): Claim | null;
  list(): Claim[];
  /** 依據中引用了指定來源文件（任一版本）的事實項 */
  listBySourceDocument(sourceDocumentId: string): Claim[];
  delete(id: string): boolean;
}

export function createClaimRepository(db: DatabaseSync): ClaimRepository {
  const table = jsonTable(db, 'claims', 'id', Claim);
  return {
    save: (claim) =>
      transaction(db, () => {
        const saved = table.upsert(
          { id: claim.id, type: claim.type, review_status: claim.reviewStatus },
          claim,
        );
        db.prepare('DELETE FROM claim_sources WHERE claim_id = ?').run(saved.id);
        const insert = db.prepare(
          'INSERT OR IGNORE INTO claim_sources (claim_id, source_document_id) VALUES (?, ?)',
        );
        for (const excerpt of saved.basis.sourceExcerpts) {
          insert.run(saved.id, excerpt.sourceDocumentId);
        }
        return saved;
      }),
    get: (id) => table.get(id),
    list: () => table.list(),
    listBySourceDocument: (sourceDocumentId) =>
      table.list(
        'id IN (SELECT claim_id FROM claim_sources WHERE source_document_id = ?)',
        sourceDocumentId,
      ),
    delete: (id) => table.delete(id),
  };
}
