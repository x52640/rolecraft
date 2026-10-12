// 投遞自介（intro.*，P1-T064、D25）handler 用的服務介面。
// 沒有任何送出或投遞方法（D7）：自介只能存檔、由使用者自己複製。
// 介面只收 schema 驗證過的職缺快照 ID 與文字，不接受也不回傳路徑、指令或模型設定（R7）。
import type { ApplicationIntro, IntroCheckView, IntroGenerationView } from '@rolecraft/contracts';

/**
 * 不開始產生的原因（handler 一律回 invalid_request＋固定文字，不回填請求內容），都不呼叫模型：
 * - not_found：職缺快照 ID 不是 helper 配發過的
 * - snapshot_not_confirmed：快照未經使用者確認（R10）
 * - no_usable_claims：沒有任何可用的事實項（先分析或確認事實項）
 * - no_service：沒有可用且已選定模型的 AI 服務（不代為挑選）
 * - over_budget：提示超過輸入預算（R8）
 */
export type IntroRefusal =
  'not_found' | 'snapshot_not_confirmed' | 'no_usable_claims' | 'no_service' | 'over_budget';

export type GenerateIntroResult =
  | { readonly ok: true; readonly generation: IntroGenerationView }
  | { readonly ok: false; readonly reason: IntroRefusal };

export interface IntroDetails {
  readonly intro: ApplicationIntro | null;
  readonly check: IntroCheckView | null;
  readonly generation: IntroGenerationView | null;
}

export type UpdateIntroResult =
  | { readonly ok: true; readonly intro: ApplicationIntro; readonly check: IntroCheckView }
  | { readonly ok: false; readonly reason: 'not_found' | 'no_intro' };

// 方法選用：沒提供時 handler 回 not_implemented，不偽造成功。
export interface IntroService {
  /** 使用者按下才觸發：在背景產生，立即回最近一次產生狀態（執行中）。 */
  generate?(jobSnapshotId: string): Promise<GenerateIntroResult>;
  /** 最近一份自介、依目前事實項重跑的檢查、最近一次產生狀態；快照不存在回 null。 */
  get?(jobSnapshotId: string): Promise<IntroDetails | null>;
  /** 儲存使用者編輯（只存檔、不送出）並重跑檢查。 */
  update?(jobSnapshotId: string, text: string): Promise<UpdateIntroResult>;
}
