import type { ExportIssueView, ResumeSection, SectionBlockerView } from '@rolecraft/contracts';

/** 段落複製的固定文字（P1-T086）。 */
export const COPY_TEXT = {
  noCheck: '無法取得匯出前檢查結果，不能複製。',
  blank: '空白段落沒有內容可複製。',
  issues: '這段有匯出前問題（見上方），處理完才能複製。',
  confirmedNotAccepted: '逐段確認不能代替接受：請先接受措辭，才能複製。',
  rejected: '已退回的段落不能複製：改寫後接受，或刪除整段。',
  notAccepted: '請先接受措辭，才能複製。',
  blockers: '這段還不能匯出（見上方），處理完才能複製。',
  done: '已複製這段。請到求職網站貼上，並由你自己送出。',
  clipboard: '無法複製到剪貼簿：請手動選取文字複製。',
  failed: '無法重新讀取或檢查，沒有複製：',
  missing: '這段已不存在（可能在別處被刪除），沒有複製：請按「重新整理」。',
  changed: '重新檢查期間這段有變更，沒有複製：請按「重新整理」後再試。',
  mismatch:
    '已儲存的內容和畫面不一致（可能在別處修改），沒有複製：請按「重新整理」確認後再按一次。',
  recheck: '重新檢查沒有通過，不能複製：',
  stale: '畫面在檢查期間有更新，沒有複製：請確認後再按一次。',
} as const;

/** 一段在某次匯出前檢查下的狀態。 */
export interface SectionGate {
  section: ResumeSection;
  issues: readonly ExportIssueView[];
  blockers: readonly SectionBlockerView[];
}

/**
 * 不能複製的原因；可以複製回 null。把關比照匯出（R1）：
 * 該段有任何 R1 問題、在 blockers 裡（含只逐段確認、未接受）、尚未接受措辭、或是空白段落都不能複製。
 * blockers 由 helper 判定；未接受另外在本機再擋一次（保守）。
 */
export function copyBlockReason({ section, issues, blockers }: SectionGate): string | null {
  if (section.text.trim() === '') return COPY_TEXT.blank;
  if (issues.length > 0) return COPY_TEXT.issues;
  const decision = section.decision ?? 'pending';
  if (decision === 'rejected') return COPY_TEXT.rejected;
  if (decision !== 'accepted') {
    const confirmed = section.sectionConfirmation?.text === section.text;
    return confirmed ? COPY_TEXT.confirmedNotAccepted : COPY_TEXT.notAccepted;
  }
  if (blockers.length > 0) return COPY_TEXT.blockers;
  return null;
}

/** 重新檢查結果中，第一個屬於這段的問題說明（沒有回 null）。 */
export function firstProblem(
  sectionId: string,
  issues: readonly ExportIssueView[],
  blockers: readonly SectionBlockerView[],
): string | null {
  const issue = issues.find((i) => i.sectionId === sectionId);
  if (issue) return issue.message;
  return blockers.find((b) => b.sectionId === sectionId)?.message ?? null;
}
