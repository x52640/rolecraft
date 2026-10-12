// resume-import 的擷取結果 → 橋接回應的 ImportResult（只留編輯器要看的：原文行、欄位草稿與出處）。
import type {
  ImportDraft,
  ImportDraftField,
  ImportResult,
  ImportStructuredDraft,
} from '@rolecraft/contracts';
import type { DraftField, ExtractResult, StructuredDraft } from '@rolecraft/resume-import';

function toField(field: DraftField): ImportDraftField {
  return {
    value: field.value,
    pageNumber: field.source.pageNumber,
    lineIndex: field.source.lineIndex,
  };
}

const toOptional = (field: DraftField | null): ImportDraftField | null =>
  field ? toField(field) : null;

/** 版面專屬的結構化草稿（P1-T066）：欄位與出處原樣帶出。 */
function toStructured(structured: StructuredDraft): ImportStructuredDraft {
  return {
    layout: structured.layout,
    personalInfo: structured.personalInfo.map((row) => ({
      label: row.label,
      value: toField(row.value),
    })),
    experiences: structured.experiences.map((e) => ({
      company: toOptional(e.company),
      title: toOptional(e.title),
      startDate: toOptional(e.startDate),
      endDate: toOptional(e.endDate),
      current: e.current,
      description: toOptional(e.description),
    })),
    skills: structured.skills.map(toField),
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
    ...(draft.structured ? { structured: toStructured(draft.structured) } : {}),
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
