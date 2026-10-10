// resume-import 的擷取結果 → 橋接回應的 ImportResult（只留編輯器要看的：原文行、欄位草稿與出處）。
import type { ImportDraft, ImportDraftField, ImportResult } from '@rolecraft/contracts';
import type { DraftField, ExtractResult } from '@rolecraft/resume-import';

function toField(field: DraftField): ImportDraftField {
  return {
    value: field.value,
    pageNumber: field.source.pageNumber,
    lineIndex: field.source.lineIndex,
  };
}

/** 擷取結果轉成 ImportResult；失敗只帶原因，不當成成功。 */
export function toImportResult(displayName: string, extracted: ExtractResult): ImportResult {
  if (!extracted.ok) return { status: 'failed', displayName, reason: extracted.reason };
  const { draft } = extracted;
  const importDraft: ImportDraft = {
    name: draft.name ? toField(draft.name) : null,
    dates: draft.dates.map(toField),
    companies: draft.companies.map(toField),
    titles: draft.titles.map(toField),
    experiences: draft.experiences.map(toField),
    skills: draft.skills.map(toField),
  };
  return {
    status: 'parsed',
    displayName,
    pages: extracted.pages.map((page) => ({
      pageNumber: page.pageNumber,
      lines: page.lines.map((line) => line.text),
    })),
    pagesWithoutText: [...extracted.pagesWithoutText],
    draft: importDraft,
  };
}

/** 顯示名稱只取檔名（去掉任何上層路徑），空的話用預設名；不把路徑送出 helper（R7）。 */
export function safeDisplayName(fileName: string): string {
  const base = fileName.split(/[/\\]/u).pop() ?? '';
  return /\S/u.test(base) ? base : '履歷.pdf';
}
