---
id: P1-T041
phase: 1
status: done
depends_on: ["P1-T034"]
specs: ["bridge.md", "architecture.md"]
track: bridge
primary_repo: rolecraft
write_paths: ["packages/contracts/src/bridge/", "packages/contracts/src/index.ts", "apps/helper/src/bridge/", "apps/helper/src/handlers/", "docs/specs/bridge.md", "apps/extension/src/relay/"]
contract_change: additive
expected_commit: "feat(P1-T041): 橋接：編輯器頁面所需操作清單"
---

# 橋接：編輯器頁面所需操作清單

## 目標

編輯器各頁（P1-T019、T020、T021、T028、T030、T040）都要新增橋接操作。先一次定好操作清單與 schema、helper 分派先回 not_implemented，各頁 Task 才能平行只實作自己的 handler 而不互相衝突。

## 範圍

### 包含

- 在 contracts 新增編輯器頁面需要的操作（request／response schema）：職缺快照（列表、取得、手動貼上建立、修改、確認）；履歷 PDF 匯入（選檔、解析結果、逐欄校正、確認）；專案資料夾（新增資料夾＝helper 開原生選取器、列舉預覽、勾選授權、移除、增量待確認清單）；投遞紀錄（列表、建立、更新、刪除）；供應商狀態（三家狀態、Claude 模型候選與驗證、登入引導）；匯出（觸發匯出、取得匯出版本與 PDF 分塊）
- 每個操作在 helper 有一個 handler 檔，先回 `not_implemented`；分派表註冊完成
- content script 只能用職缺／訊息擷取操作；其餘只限擴充功能頁（relay 的 sender 規則更新）
- `bridge.md` 操作表更新（只寫語意）
- PDF 等大回應的分塊協定（用請求 id；分塊格式與上限）

### 不包含

- 各操作的實際邏輯（由各頁 Task 實作）

## 工作區與 Context

### 必讀入口

- `docs/specs/bridge.md`
- `docs/specs/architecture.md`
- 相依 Task 的完成結果；`docs/RESIDUALS.md` 相關條目

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- R7：任何 schema 不得有路徑、指令、CLI 參數類欄位；檔案只經 helper 原生選取器進入授權集合（ADR-0003），請求只帶不透明 ID
- 高風險（R7），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 各項有測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：contracts 47 個操作 schema、helper 分派表＋每操作一個 handler 檔、relay sender 規則、bridge.md 操作表與分塊協定、測試
- 已通過驗證：主樹 `npm run verify` 綠（Vitest 1850 通過）；對抗驗證（E3）屬實 3 項已修（巢狀 claimId、`messageDraftId`／`jobSnapshotId` 改 OpaqueId、職缺網址限 http(s)）；第二個審查角度（發送端與分派）回傳空結果
- 下一步：協調者收官前跑對抗驗證（高風險 R7）
- Blocker：無

## 完成結果

範圍說明：除原「包含」六組外，協調者擴充加入 claims（P1-T023）、resume（P1-T025）、messages（P1-T029）三組操作與 handler，因為這些 Task 的 write_paths 不含 contracts 與分派表。

- contracts（`packages/contracts/src/bridge/`）：`BridgeOperation` 由 3 個增為 47 個；編輯器操作以「群組.動作」命名，各群組 schema 在 `editor/<群組>.ts`，`BRIDGE_SCHEMAS` 展開組合、`BridgeRequest` 由它產生。新增 `common.ts`（`OpaqueId`：1–128 個英數／`_`／`-`、開頭英數；`EmptyPayload`、`Ack`、`bridgeOp`）、`chunk.ts`（分塊）、`CONTENT_SCRIPT_OPERATIONS`、型別 `BridgeRequestOf<Op>`／`BridgeResponseOf<Op>`。原三個擷取操作名稱與形狀不變（additive）。
- R7：請求沒有任何路徑、指令、CLI 參數、模型名稱欄位；指向物件一律 `OpaqueId`；選檔／選資料夾的請求 payload 只能是空物件，由 helper 開系統選取器；確認時間由 helper 決定。既有的禁用鍵名測試涵蓋全部 47 個操作的 request 與 response（所以資料夾用 root／entry、供應商用 service／candidate 命名）。
- 分塊：應用層逐塊讀（`export.read_pdf`：內容 id＋塊序號 → 第幾塊／共幾塊／整份位元組數／整份 SHA-256／base64），每塊原始 512 KiB、最多 128 塊；每塊是獨立請求，信封協定不變。測試鎖住最大一塊的整則框低於 1 MB。
- helper：分派表 `src/handlers/registry.ts`（`HandlerTable` 型別擋漏列／多列）一次註冊全部操作；`dispatch.ts` 改查表。每個操作一個 handler 檔，未實作的回 `not_implemented`。每個群組的服務介面在 `handlers/<群組>/service.ts`，`handlers/services.ts` 只組合（鍵：jobs、resumeImport、sources、applications、providers、pdfExport、claims、resume、messages）；原 `jobCapture`／`messageCapture`／`draft` 服務改為 `jobs.submitCapture`、`messages.submitCapture`、`messages.requestDraft`，原三個 handler 移入 jobs／messages 目錄。
- relay：sender 規則改用 contracts 的 `CONTENT_SCRIPT_OPERATIONS`，其餘操作只限擴充功能頁。
- 後續 Task 對應的 handler 檔（都在 `apps/helper/src/handlers/`；各群組另有 `service.ts`）：
  - P1-T019 → `jobs/`：`submit-job-capture.ts`、`list.ts`、`get.ts`、`update.ts`、`confirm.ts`
  - P1-T020 → `import/`：`pick-pdf.ts`、`get.ts`、`save-corrections.ts`、`confirm.ts`
  - P1-T021 → `sources/`：`pick-folders.ts`、`list-folders.ts`、`preview.ts`、`update-authorization.ts`、`remove-folder.ts`
  - P1-T028 → `applications/`：`list.ts`、`create.ts`、`update.ts`、`delete.ts`
  - P1-T030 → `providers/`：`status.ts`、`recheck.ts`、`list-candidates.ts`、`select-candidate.ts`、`start-login.ts`
  - P1-T040 → `export/`：`create.ts`、`list-versions.ts`、`get-version.ts`、`read-pdf.ts`
  - P1-T023 → `claims/`：`list-projects.ts`、`list.ts`、`get.ts`、`confirm.ts`、`update.ts`、`reject.ts`
  - P1-T025 → `resume/`：`generate.ts`、`list.ts`、`get.ts`、`accept-section.ts`、`reject-section.ts`、`edit-section.ts`、`delete-section.ts`、`confirm-section.ts`、`check-export.ts`
  - P1-T029 → `messages/`：`submit-message-capture.ts`、`request-draft.ts`、`list.ts`、`get.ts`、`update-draft.ts`
- 測試：contracts（每操作合法請求、頂層／payload 多帶欄位、ID 欄位拒路徑／旗標／空白、各別規則、分塊邊界與 1 MB）；helper（分派表涵蓋全部操作、每操作恰有一個 handler 檔、未實作回 not_implemented、路徑類 ID 不進 handler 且不入日誌、最大塊可編碼成單框、contracts 鏡像列舉與 domain／resume-import 型別一致）；extension（content script 對每個非擷取操作被拒、擴充功能頁全部允許、合法的事實項確認從職缺頁送出不轉送）。
- 協調者同步：ADR-0006 第 8 項已更新；第二波各頁 Task 的 write_paths 加入 `apps/helper/src/main.ts`（服務組裝）。
