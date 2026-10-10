// 履歷 PDF 匯入（import.*）handler 用的服務介面（P1-T020）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 方法皆可省略：沒接上的方法，handler 回 not_implemented，不偽造成功。
import type { ImportResult, ProfileInput } from '@rolecraft/contracts';

/** import.pick_pdf 的結果；busy＝已有一個選取視窗開著（同時只開一個）。 */
export type PickPdfOutcome =
  | { status: 'selected'; importId: string; displayName: string }
  | { status: 'cancelled' }
  | { status: 'busy' };

/** 寫入類操作的結果。unknown_import＝不是本服務配發（或已清掉）的 importId。 */
export type SaveOutcome = { ok: true } | { ok: false; reason: 'unknown_import' };

/** empty_profile＝姓名等個人資料、經歷、技能全空，不寫入。 */
export type ConfirmOutcome =
  { ok: true; profileId: string } | { ok: false; reason: 'unknown_import' | 'empty_profile' };

export interface ResumeImportService {
  /** helper 開系統檔案選取器（只限 PDF）並在本機解析；請求不帶路徑。 */
  pickPdf?(): Promise<PickPdfOutcome>;
  /** 解析結果；查不到回 null。 */
  get?(importId: string): ImportResult | null;
  /** 暫存逐欄校正：不算確認、不寫入 Profile、不能用於生成。 */
  saveCorrections?(importId: string, profile: ProfileInput): SaveOutcome;
  /** 以請求帶來的（使用者確認當下看到的）內容寫入 Profile，並標為已確認（R10）。 */
  confirm?(importId: string, profile: ProfileInput): ConfirmOutcome;
}
