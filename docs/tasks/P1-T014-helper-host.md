---
id: P1-T014
phase: 1
status: in_progress
depends_on: ["P1-T013", "P1-T006"]
specs: ["bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/"]
contract_change: none
expected_commit: "feat(P1-T014): helper：橋接端點與操作清單分派"
---
# helper：橋接端點與操作清單分派

## 目標

R7：本機只開放固定操作，內容永遠是資料。

## 範圍

### 包含

- 依 ADR-0003 實作傳輸層
- 操作分派表：只接受 contracts 中列舉的操作，逐一驗 schema，未知操作拒絕
- 每個操作一個 handler 檔；handler 透過介面呼叫 storage／sources／pipeline
- 啟動、關閉、錯誤日誌（不記錄履歷全文）

### 不包含

- 各 handler 的業務邏輯細節（由對應 Task 補）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/bridge.md`
- `docs/specs/architecture.md`
- 相依 Task 的「完成結果」：P1-T013
- 相依 Task 的「完成結果」：P1-T006

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不得有任何把請求內容傳給 shell、檔案路徑或 CLI 參數的程式路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 分派測試：未知操作、多餘欄位、超大訊息都被拒

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：傳輸層（框編解碼、來源驗證、依序處理的 host 迴圈）、分派表、4 個 handler（服務未接時回「尚未支援」）、固定欄位日誌、子行程端到端與 R7 靜態掃描測試
- 已通過驗證：`npm run verify` 綠（Vitest 26 檔 246 測試；helper 7 檔 107 測試）
- 下一步：對抗驗證（E3）後協調者收官
- Blocker：無

## 完成結果

- `apps/helper/src/bridge/`：`framing.ts`（native byte order 長度＋UTF-8 JSON；收 1 MiB、送 1 MB 上限；長度欄位先檢查再收內容；非法 UTF-8 算壞框；出錯後不重新同步）、`origin.ts`（`chrome-extension://<32 a–p>/` 逐字比對允許清單；清單來自環境變數 `ROLECRAFT_ALLOWED_ORIGINS`，未設＝全拒、格式錯＝不啟動；`NATIVE_HOST_NAME = com.rolecraft.helper` 與擴充功能端一致）、`dispatch.ts`（op 先比對 `BridgeOperation`，再用 contracts `BridgeRequest` strict 驗證；handler 例外與回應不合 schema 都回 `internal_error`；錯誤訊息固定文字不回填內容）、`host.ts`（主迴圈）、`logger.ts`（只寫 stderr、只收固定欄位，不記請求內容、例外訊息與堆疊）。
- `apps/helper/src/handlers/`：每操作一檔；`services.ts` 定義 storage／pipeline 服務介面，目前 `createServices()` 全部未接，handler 回 `internal_error`＋`not_implemented` 字樣，不偽造成功。
- `apps/helper/src/main.ts`：執行入口（`node apps/helper/src/main.ts <origin>`）；只從 argv 讀 origin、從環境變數讀允許清單。
- 併發：contracts 信封沒有請求 ID，所以請求依抵達順序**逐一**處理、依序回覆；未回覆上限 32 則，超過斷線。
- 結束碼：0 正常、1 設定錯、2 origin 被拒、3 框錯誤／未回覆過多、4 框被截斷。框錯誤時先回完已排隊的請求，再送一則 `invalid_request` 後斷線。
- 待定：contracts 無「未實作」代碼與請求 ID（要平行處理或分塊時需改 contracts）；允許清單來源（環境變數由安裝程式寫入包裝檔）待 P1-T031 確認。

### 對抗驗證修正

- 壞框前的請求遺失：同一 stdin chunk 內「合法框＋壞框（壞 JSON 或長度超上限）」時，`FrameDecoder.push()` 丟錯連帶丟掉已解出的訊息，host 只送一則 `invalid_request`，擴充功能會把它當成第一個合法請求的回覆（無請求 ID、靠順序對應）；結果取決於 pipe 怎麼切 chunk。
- 修法：`FrameDecoder` 新增 `decode(chunk) → { messages, error? }`，出錯時仍交出壞框之前的訊息；host 改用它，先照常排隊（仍檢查未回覆上限），回完後再送 `invalid_request` 並以 3 結束。`push()` 保留為會丟錯的簡便版（只給出錯就整個放棄的呼叫端，如測試讀回覆）。
- 回歸測試：`framing.test.ts`（同 chunk 合法框＋壞 JSON／超長標頭：先交出訊息再回報錯誤）、`host.test.ts`（同 chunk 與分兩個 chunk 對照，回覆皆為 `[{ ok: true }, invalid_request]`、handler 呼叫 1 次）。
