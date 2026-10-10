import type { DatabaseSync } from 'node:sqlite';

import type { ExportVersion } from '@rolecraft/contracts';

/**
 * 「素材」＝匯出版本保存了副本的原件（R3）：履歷版本、事實項、來源文件（片段原文）、職缺快照。
 * D19：刪除素材時，未投遞的匯出版本整份刪除，已投遞的保留並明示。
 */
export type MaterialKind = 'claim' | 'source_document' | 'resume_version' | 'job_snapshot';

export interface MaterialRef {
  kind: MaterialKind;
  id: string;
}

/** 判斷副本只需要的欄位（匯出版本建立前也能檢查）。 */
export type MaterialCopies = Pick<
  ExportVersion,
  'citedClaims' | 'sections' | 'sourceDocumentIds' | 'resumeVersionId' | 'jobSnapshot'
>;

/** 匯出版本是否保存了該素材的副本。 */
export function holdsCopyOf(version: MaterialCopies, ref: MaterialRef): boolean {
  switch (ref.kind) {
    case 'claim':
      return (
        version.citedClaims.some((c) => c.claimId === ref.id) ||
        version.sections.some((s) => s.citations.some((c) => c.claimId === ref.id))
      );
    case 'source_document':
      return version.sourceDocumentIds?.includes(ref.id) ?? false;
    case 'resume_version':
      return version.resumeVersionId === ref.id;
    case 'job_snapshot':
      return version.jobSnapshot.id === ref.id;
  }
}

/** 記下使用者刪除了這個素材（重複刪除保留第一次的時間）。 */
export function recordDeletedMaterial(db: DatabaseSync, ref: MaterialRef, at: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at) VALUES (?, ?, ?)',
  ).run(ref.kind, ref.id, at);
}

/** 使用者刪除過、而這個匯出版本仍保存其副本的素材（D19「明示」用）。 */
export function deletedMaterialsHeldBy(db: DatabaseSync, version: MaterialCopies): MaterialRef[] {
  return db
    .prepare(
      'SELECT kind, material_id FROM deleted_materials ORDER BY deleted_at, kind, material_id',
    )
    .all()
    .map((row) => ({ kind: row.kind as MaterialKind, id: String(row.material_id) }))
    .filter((ref) => holdsCopyOf(version, ref));
}
