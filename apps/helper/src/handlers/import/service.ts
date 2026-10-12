// 履歷匯入（import.*、submit_resume_capture）handler 用的服務介面（P1-T020；D28 加網頁與手動來源）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 方法皆可省略：沒接上的方法，handler 回 not_implemented，不偽造成功。
import type {
  ImportAiParseView,
  ImportLatestCapture,
  ImportResult,
  ProfileInput,
  SubmitResumeCaptureRequest,
} from '@rolecraft/contracts';

/** submit_resume_capture 的內容（schema 驗證過；區塊編號由服務依順序配發）。 */
export type ResumeCapturePayload = SubmitResumeCaptureRequest['payload'];

/** import.pick_pdf 的結果；busy＝已有一個選取視窗開著（同時只開一個）。 */
export type PickPdfOutcome =
  | { status: 'selected'; importId: string; displayName: string }
  | { status: 'cancelled' }
  | { status: 'busy' };

/** 寫入類操作的結果。unknown_import＝不是本服務配發（或已清掉）的 importId。 */
export type SaveOutcome = { ok: true } | { ok: false; reason: 'unknown_import' };

/**
 * empty_profile＝姓名等個人資料、經歷、技能全空，不寫入。
 * multiple_profiles＝資料區已有多份 Profile（舊資料），不寫入（D28／Q8）。
 */
export type ConfirmOutcome =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'unknown_import' | 'empty_profile' | 'multiple_profiles' };

/**
 * 不開始 AI 整理的原因（都不呼叫模型；P1-T069）：
 * - unknown_import：不是本服務配發（或已清掉）的 importId
 * - not_parsed：這份 PDF 解析失敗（沒有可整理的文字）
 * - no_text：移除姓名與聯絡資料後沒有任何文字可送
 * - no_service：沒有可用且已選定模型的 AI 服務（不代為挑選）
 * - over_budget：提示超過輸入預算（R8）
 */
export type AiParseRefusal =
  'unknown_import' | 'not_parsed' | 'no_text' | 'no_service' | 'over_budget';

export type AiParseOutcome =
  { ok: true; parse: ImportAiParseView } | { ok: false; reason: AiParseRefusal };

export type AiStatusOutcome =
  { ok: true; parse: ImportAiParseView | null } | { ok: false; reason: 'unknown_import' };

export interface ResumeImportService {
  /** helper 開系統檔案選取器（只限 PDF）並在本機解析；請求不帶路徑。 */
  pickPdf?(): Promise<PickPdfOutcome>;
  /** 解析結果；查不到回 null。 */
  get?(importId: string): ImportResult | null;
  /** 暫存逐欄校正：不算確認、不寫入 Profile、不能用於生成。 */
  saveCorrections?(importId: string, profile: ProfileInput): SaveOutcome;
  /** 以請求帶來的（使用者確認當下看到的）內容寫入 Profile，並標為已確認（R10）。 */
  confirm?(importId: string, profile: ProfileInput): ConfirmOutcome;
  /** 用選定的 Claude 模型在背景整理（P1-T069）；立即回狀態，已有執行中的就回同一個。 */
  aiParse?(importId: string): Promise<AiParseOutcome>;
  /** 最近一次 AI 整理的狀態與（成功時）草稿。 */
  aiStatus?(importId: string): AiStatusOutcome;
  /** D28：建立網頁來源的匯入工作階段（只在記憶體），不呼叫模型。 */
  submitResumeCapture?(capture: ResumeCapturePayload): void;
  /** D28：最近一次網頁擷取；沒有回 null。不觸發 AI 整理。 */
  latestCapture?(): ImportLatestCapture | null;
  /** D28：建立沒有原文的工作階段（手動輸入）。 */
  startManual?(): { importId: string };
}
