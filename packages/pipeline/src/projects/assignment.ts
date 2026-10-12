/**
 * 事實項歸屬規則（D23；evidence-model「專案分組與事實項歸屬」）：建立專案與重新分析共用。
 * 所有來源片段的文件都屬同一專案 → 該專案；跨多個專案、有來源文件不屬任何專案、沒有來源片段 → null（未歸專案）。
 */
import type { Claim, Id } from '@rolecraft/contracts';

export function projectForClaim(
  claim: Claim,
  projectOf: (sourceDocumentId: Id) => Id | null,
): Id | null {
  const documents = new Set(claim.basis.sourceExcerpts.map((e) => e.sourceDocumentId));
  if (documents.size === 0) return null;
  let project: Id | null = null;
  for (const documentId of documents) {
    const owner = projectOf(documentId);
    if (owner === null) return null;
    if (project !== null && project !== owner) return null;
    project = owner;
  }
  return project;
}
