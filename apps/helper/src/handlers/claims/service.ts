// 事實項（claims.*）handler 用的服務介面（P1-T023）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
import type { BridgeRequestOf, Claim, ProjectEvidence } from '@rolecraft/contracts';

/** 寫入動作的結果。失敗原因是固定文字（不回填請求內容），handler 轉成 invalid_request。 */
export type ClaimsWriteResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'rejected' | 'stale' };

export interface ClaimsService {
  listProjects(): Promise<ProjectEvidence[]>;
  /** 專案不存在回 null；已刪除（否決）的事實項不列出。 */
  listClaims(projectId: string): Promise<Claim[] | null>;
  getClaim(claimId: string): Promise<Claim | null>;
  /**
   * 確認事實項（R1、D14）：確認時間由服務決定，記錄確認當下的文字。
   * 「使用者確認完成」只能經由這裡產生。畫面看到的複核狀態與目前不同時回 stale、不寫入（R2）。
   */
  confirm(payload: BridgeRequestOf<'claims.confirm'>['payload']): Promise<ClaimsWriteResult>;
  /** 修改內容：既有使用者確認失效，要重新確認。 */
  update(payload: BridgeRequestOf<'claims.update'>['payload']): Promise<ClaimsWriteResult>;
  /** 否決：刪除事實項（D19 刪除素材），之後不得用於生成。 */
  reject(claimId: string): Promise<ClaimsWriteResult>;
}
