// 投遞自介（intro.*，P1-T064、D25）handler 用的服務介面。
// 沒有任何送出或投遞方法（D7）：自介只能存檔、由使用者自己複製。
// 介面只收 schema 驗證過的職缺快照 ID 與文字，不接受也不回傳路徑、指令或模型設定（R7）。
import type {
  ApplicationIntro,
  IntroCheckView,
  IntroDraft,
  IntroGenerationView,
} from '@rolecraft/contracts';

/**
 * 不開始產生的原因（handler 一律回 invalid_request＋固定文字，不回填請求內容），都不呼叫模型：
 * - not_found：職缺快照 ID 不是 helper 配發過的
 * - snapshot_not_confirmed：快照未經使用者確認（R10）
 * - no_usable_claims：沒有任何可用的事實項（先分析或確認事實項）
 * - no_service：沒有可用且已選定模型的 AI 服務（不代為挑選）
 * - over_budget：提示超過輸入預算（R8）
 * - no_draft：「請 AI 修正」或儲存草稿時沒有未通過的草稿（P1-T071）
 * - draft_stale：草稿產生後職缺快照被修改或取消確認，不能再用它修正
 */
export type IntroRefusal =
  | 'not_found'
  | 'snapshot_not_confirmed'
  | 'no_usable_claims'
  | 'no_service'
  | 'over_budget'
  | 'no_draft'
  | 'draft_stale';

export type GenerateIntroResult =
  | { readonly ok: true; readonly generation: IntroGenerationView }
  | { readonly ok: false; readonly reason: IntroRefusal };

export interface IntroDetails {
  readonly intro: ApplicationIntro | null;
  readonly check: IntroCheckView | null;
  readonly generation: IntroGenerationView | null;
  /** 最近一次沒通過檢查的草稿（P1-T071，只在記憶體） */
  readonly draft: IntroDraft | null;
}

/**
 * 儲存失敗的原因（固定文字）。草稿相關（P1-T071）：draft_failed＝仍沒通過檢查（修改已留在草稿上）、
 * snapshot_changed／intro_changed＝草稿產生後快照或已存自介變了（不覆蓋）、generation_running＝產生中。
 */
export type UpdateIntroFailure =
  | 'not_found'
  | 'no_intro'
  | 'no_draft'
  | 'draft_failed'
  | 'snapshot_changed'
  | 'intro_changed'
  | 'generation_running';

export type UpdateIntroResult =
  | { readonly ok: true; readonly intro: ApplicationIntro; readonly check: IntroCheckView }
  | { readonly ok: false; readonly reason: UpdateIntroFailure };

// 方法選用：沒提供時 handler 回 not_implemented，不偽造成功。
export interface IntroService {
  /** 使用者按下才觸發：在背景產生，立即回最近一次產生狀態（執行中）。fix＝「請 AI 修正」目前的草稿。 */
  generate?(jobSnapshotId: string, options?: { fix?: boolean }): Promise<GenerateIntroResult>;
  /** 最近一份自介、依目前事實項重跑的檢查、最近一次產生狀態；快照不存在回 null。 */
  get?(jobSnapshotId: string): Promise<IntroDetails | null>;
  /** 儲存使用者編輯（只存檔、不送出）並重跑檢查。draft＝儲存未通過草稿上的修改（通過才成為正式自介）。 */
  update?(
    jobSnapshotId: string,
    text: string,
    options?: { draft?: boolean },
  ): Promise<UpdateIntroResult>;
}
