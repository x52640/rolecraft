// 投遞紀錄（applications.*）handler 用的服務介面（P1-T028）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 只是記錄：沒有任何代為投遞或送出的方法（D7）。
// 方法皆為選填：服務物件存在但缺方法時，該操作仍回 not_implemented，不偽造成功。
import type { ApplicationRecord, BridgeRequestOf } from '@rolecraft/contracts';

/** 新增／修改共用的欄位：起因、投遞日期、狀態、實際投出的匯出版本。 */
export type ApplicationFields = BridgeRequestOf<'applications.create'>['payload'];

/** 服務拒絕的原因；handler 一律轉成 invalid_request＋固定訊息（不回填請求內容）。 */
export type ApplicationsRejection =
  /** 投遞紀錄 ID 不是 helper 配發過的 */
  | 'application_not_found'
  /** 實際投出版本不是既有的匯出版本（R3） */
  | 'export_version_not_found'
  /** 實際投出版本建立後不能改指向（R3；storage 觸發器也擋） */
  | 'export_version_locked';

export type ApplicationsResult<T> =
  { ok: true; value: T } | { ok: false; reason: ApplicationsRejection };

export interface ApplicationsService {
  /** 依投遞日期排序的全部投遞紀錄 */
  list?(): Promise<ApplicationRecord[]>;
  /** 新增；實際投出版本只能指向既有的匯出版本（R3） */
  create?(fields: ApplicationFields): Promise<ApplicationsResult<{ applicationId: string }>>;
  /** 修改起因、日期、狀態；實際投出版本必須與原紀錄相同 */
  update?(applicationId: string, fields: ApplicationFields): Promise<ApplicationsResult<null>>;
  /** 整筆刪除（D19）；匯出版本本身依 storage 規則處理 */
  delete?(applicationId: string): Promise<ApplicationsResult<null>>;
}
