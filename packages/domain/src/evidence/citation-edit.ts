/**
 * 引用編輯規則（R1 第 2 輪補）：段落編輯只能增加引用，不能移除；
 * 要去掉引用只能刪除整段。段落來源與生成當下的引用紀錄不可改。
 * 編輯器／儲存層在寫入段落修改前呼叫本函式，有違規就拒絕寫入。
 */
import type { ClaimCitation, ResumeSection } from '@rolecraft/contracts';

export type CitationEditViolationCode =
  'section_id_changed' | 'origin_changed' | 'generated_citations_changed' | 'citation_removed';

export interface CitationEditViolation {
  readonly code: CitationEditViolationCode;
  readonly claimId?: string;
  readonly message: string;
}

function citationsKey(citations: readonly ClaimCitation[] | undefined): string {
  if (citations === undefined) return 'none';
  return JSON.stringify(citations.map((c) => [c.claimId, c.statedCompletion ?? null]));
}

/** 檢查一段從 before 改成 after 是否合法。回傳空陣列表示合法。 */
export function checkSectionEdit(
  before: ResumeSection,
  after: ResumeSection,
): CitationEditViolation[] {
  const violations: CitationEditViolation[] = [];
  if (before.id !== after.id) {
    violations.push({ code: 'section_id_changed', message: '段落 ID 不可更改' });
  }
  if (before.origin !== after.origin) {
    violations.push({ code: 'origin_changed', message: '段落來源（生成／使用者新寫）不可更改' });
  }
  if (citationsKey(before.generatedCitations) !== citationsKey(after.generatedCitations)) {
    violations.push({ code: 'generated_citations_changed', message: '生成當下的引用紀錄不可更改' });
  }
  const remaining = new Set(after.citations.map((c) => c.claimId));
  for (const citation of before.citations) {
    if (!remaining.has(citation.claimId)) {
      violations.push({
        code: 'citation_removed',
        claimId: citation.claimId,
        message: '不能只移除引用；要去掉引用只能刪除整段',
      });
    }
  }
  return violations;
}
