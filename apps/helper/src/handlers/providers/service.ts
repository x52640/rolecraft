// 供應商狀態（providers.*）handler 用的服務介面（P1-T030）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 方法皆為選填：服務組裝只接上一部分時，缺的方法由 handler 回 not_implemented，不偽造成功。
import type { BridgeResponseOf, CheckOutcome, Provider } from '@rolecraft/contracts';

export type ServiceStatus = Extract<BridgeResponseOf<'providers.recheck'>, { ok: true }>['status'];
export type ServiceCandidate = Extract<
  BridgeResponseOf<'providers.list_candidates'>,
  { ok: true }
>['candidates'][number];

/**
 * 選定候選的結果：ID 不在 helper 自己列過的清單 → unknown_candidate；
 * 服務目前不是「可用」→ not_available（不呼叫模型）。兩者 handler 都回 invalid_request。
 */
export type SelectResult =
  | { readonly kind: 'unknown_candidate' }
  | { readonly kind: 'not_available' }
  | { readonly kind: 'verified'; readonly verification: CheckOutcome };

export interface PrepareRunResult {
  readonly status: ServiceStatus;
  /** 檢查還在背景進行（等超過上限） */
  readonly checking: boolean;
}

export interface ProvidersService {
  /**
   * 三家最近一次檢查的狀態。本程序還沒檢查過 Claude 時先自動做一次連線檢查（不重新驗證、
   * 不呼叫模型；P1-T070），之後不觸發新檢查。生成端解析選定模型也經這裡。
   */
  status?(): Promise<readonly ServiceStatus[]>;
  /**
   * 使用者發起需要該服務的工作前（P1-T070）：已選定模型、且目前不是可用時做一次一般檢查
   * （D22／D24 照常自動重新驗證；停用的版本不重試），回檢查後的狀態。沒選定模型不檢查。
   * 檢查超過等待上限（橋接逾時）時 checking=true：檢查在背景繼續，呼叫端回「檢查中」。
   */
  prepareRun?(service: Provider): Promise<PrepareRunResult>;
  /** 重新檢查一家（安裝、登入、R5 版本閘門、R6），回新的狀態。 */
  recheck?(service: Provider): Promise<ServiceStatus>;
  /** 候選清單；ID 由 helper 配發，同一個 helper 程序內穩定。 */
  listCandidates?(service: Provider): Promise<readonly ServiceCandidate[]>;
  /** 只接受自己列過的候選 ID；請求字串不會直接成為 CLI 參數。 */
  selectCandidate?(service: Provider, candidateId: string): Promise<SelectResult>;
  /**
   * 重新啟用 Claude（D24、P1-T062）：在背景對目前版本重跑注入測試，立即回覆。
   * started=false 表示已有一次在跑；結果記在 Claude 狀態的 versionCheck／lastReverify。
   */
  reverifyClaude?(): Promise<{ readonly started: boolean; readonly status: ServiceStatus }>;
}
