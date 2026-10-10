// 匯出版本（export.*）handler 用的服務介面（P1-T040）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 方法直接回該操作的橋接回應；方法未提供（服務未接上）時 handler 回 not_implemented，不偽造成功。
// 實作見 export-service.ts（createExportService）。
import type { BridgeRequestOf, BridgeResponseOf } from '@rolecraft/contracts';

type Payload<Op extends 'export.create' | 'export.get_version' | 'export.read_pdf'> =
  BridgeRequestOf<Op>['payload'];

export interface ExportService {
  /** R1 通過才匯出；匯出不等於投遞（R3）。 */
  create?(payload: Payload<'export.create'>): Promise<BridgeResponseOf<'export.create'>>;
  listVersions?(): Promise<BridgeResponseOf<'export.list_versions'>>;
  getVersion?(
    payload: Payload<'export.get_version'>,
  ): Promise<BridgeResponseOf<'export.get_version'>>;
  /** 分塊協定（bridge.md「分塊」）：一請求一塊。 */
  readPdf?(payload: Payload<'export.read_pdf'>): Promise<BridgeResponseOf<'export.read_pdf'>>;
}
