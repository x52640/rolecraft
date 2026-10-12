// 擷取結果 → AI 整理的輸入（P1-T069）：原文行、本機找到的姓名（104 規則、「姓名：」、頁首大字）
// 與 104 版面已知的「標籤 ⇥ 值」（值可能接了換行續行）。姓名與聯絡資料之後在本機移除，不送模型。
import type { ImportDraftField } from '@rolecraft/contracts';
import type { PersonalHint } from '@rolecraft/pipeline';
import { headerNameCandidate, type DraftField, type ExtractResult } from '@rolecraft/resume-import';

import type { AiSource } from './ai-runner.ts';

const toField = (field: DraftField): ImportDraftField => ({
  value: field.value,
  pageNumber: field.source.pageNumber,
  lineIndex: field.source.lineIndex,
});

export function aiSourceOf(extracted: ExtractResult): AiSource | null {
  if (!extracted.ok) return null;
  const { draft, pages } = extracted;
  const structuredName = draft.structured?.personalInfo.find((row) => row.label === '姓名');
  const candidates = [structuredName?.value, draft.name, headerNameCandidate(pages)];
  const names: ImportDraftField[] = [];
  for (const candidate of candidates) {
    if (candidate && !names.some((n) => n.value === candidate.value.trim())) {
      names.push({ ...toField(candidate), value: candidate.value.trim() });
    }
  }
  const hints: PersonalHint[] = (draft.structured?.personalInfo ?? []).map((row) => ({
    label: row.label,
    value: row.value.value,
  }));
  return {
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      lines: page.lines.map((line) => line.text),
    })),
    names,
    hints,
  };
}
