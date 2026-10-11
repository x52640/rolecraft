// 分析（analysis.*）handler 用的服務介面（P1-T060）。
// 介面不收任何參數：分析範圍就是目前的授權集合（R4），模型是使用者選定的（不來自請求，R7）。
import type { AnalysisStatusView } from '@rolecraft/contracts';

/** 失敗原因（固定文字，不回填任何內容）；handler 一律轉成 invalid_request。 */
export type AnalysisFailureReason =
  | 'no_model' // 沒有選定且可用的模型：不讀檔、不呼叫模型
  | 'run_check_failed' // 續跑前重做 R6 不通過（D21）
  | 'folder_unreadable' // 有已加入的資料夾無法列舉：不動任何資料
  | 'over_budget'; // 有文件連一個片段都放不進輸入預算（R8）：來源變更判定仍已寫回

export interface AnalysisFailure {
  readonly ok: false;
  readonly reason: AnalysisFailureReason;
}

export type StartResult =
  { readonly ok: true; readonly workJobId: string | null } | AnalysisFailure;

/** 方法皆為選填（同其他群組）：未提供的方法由 handler 回 not_implemented，不偽造成功。 */
export interface AnalysisService {
  /** 增量分析；已在跑回同一個工作 id；已暫停就由使用者這次觸發續跑（D21）。分析在背景執行。 */
  start?(): Promise<StartResult>;
  /** 最近一次分析工作；沒有分析過回 null。 */
  status?(): Promise<AnalysisStatusView | null>;
}
