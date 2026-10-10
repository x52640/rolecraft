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

export interface ProvidersService {
  /** 三家最近一次檢查的狀態（不觸發新檢查）。 */
  status?(): Promise<readonly ServiceStatus[]>;
  /** 重新檢查一家（安裝、登入、R5 版本閘門、R6），回新的狀態。 */
  recheck?(service: Provider): Promise<ServiceStatus>;
  /** 候選清單；ID 由 helper 配發，同一個 helper 程序內穩定。 */
  listCandidates?(service: Provider): Promise<readonly ServiceCandidate[]>;
  /** 只接受自己列過的候選 ID；請求字串不會直接成為 CLI 參數。 */
  selectCandidate?(service: Provider, candidateId: string): Promise<SelectResult>;
}
