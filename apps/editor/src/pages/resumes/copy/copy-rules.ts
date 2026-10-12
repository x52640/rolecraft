import type { ExportIssueView, ResumeSection, SectionBlockerView } from '@rolecraft/contracts';

/** 段落複製的固定文字（P1-T086）。 */
export const COPY_TEXT = {
  noCheck: '無法取得匯出前檢查結果，不能複製。',
  blank: '空白段落沒有內容可複製。',
  hidden: '這段含有看不見的特殊字元（標籤字元或私用區字元），不能複製：請改寫成一般文字。',
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

/** 不可見字元（預設可忽略、格式、組合記號、私用區）與所有空白 */
const INVISIBLE_OR_SPACE = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Mn}\p{Me}\p{Co}\s]/gu;
/** 標籤字元（U+E0000～E007F，可把整句藏在看不見的字元裡）與私用區字元 */
const HIDDEN = /[\u{E0000}-\u{E007F}\p{Co}]/u;

/**
 * 複製用的空白判定：去掉不可見字元與空白後沒有內容（原文或 NFKC 正規化後任一成立）就算空白。
 * 刻意比 domain 的 `isBlankForNumbers`（匯出前檢查跳過空白段落用的判定）更嚴：
 * domain 判成空白的文字（NFKC 後刪不可見字元、私用區換空白、trim 後沒內容）在這裡也一定判成空白，
 * 反之不一定（例如只有讀不出的數字字元，domain 算有內容，這裡算空白）。
 * 不直接重用 domain，是因為架構規則 editor 只能依賴 contracts（architecture.md）。
 * domain 的判定若日後放寬或改變，這裡要同步確認仍是超集合。
 */
export function isBlankForCopy(text: string): boolean {
  const empty = (t: string) => t.replace(INVISIBLE_OR_SPACE, '') === '';
  return empty(text) || empty(text.normalize('NFKC'));
}

/** 段落文字含標籤字元或私用區字元：保守起見一律不能複製。 */
export function hasHiddenChars(text: string): boolean {
  return HIDDEN.test(text);
}

/**
 * 不能複製的原因；可以複製回 null。把關比照匯出（R1）：
 * 該段有任何 R1 問題、在 blockers 裡（含只逐段確認、未接受）、尚未接受措辭、空白段落（含只有不可見字元）、含標籤／私用區字元都不能複製。
 * blockers 由 helper 判定；未接受另外在本機再擋一次（保守）。
 */
export function copyBlockReason({ section, issues, blockers }: SectionGate): string | null {
  if (hasHiddenChars(section.text)) return COPY_TEXT.hidden;
  if (isBlankForCopy(section.text)) return COPY_TEXT.blank;
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
