---
id: P1-T019
phase: 1
status: in_progress
depends_on: ["P1-T016", "P1-T014", "P1-T041"]
specs: ["jobs-and-messages.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/jobs/", "apps/helper/src/handlers/jobs/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T019): editor：職缺快照確認與手動貼上"
---
# editor：職缺快照確認與手動貼上

## 目標

F06、R10：快照可修改、標示來源，手動貼上是正式備援路線。

## 範圍

### 包含

- 快照檢視與修改（記錄被修改）
- 手動貼上職缺文字建立快照（擷取方式＝手動）
- 未擷取到／頁面未提供的標示
- 快照經使用者確認才可用於生成

### 不包含

- LinkedIn 以外的任何自動化

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- 相依 Task 的「完成結果」：P1-T016
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 畫面不得把手動標成自動
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：helper jobs 服務與 handler、main.ts 接線、editor 職缺頁（清單／手動貼上／檢視修改確認）
- 已通過驗證：`npm run verify` 綠（Vitest 1883 通過、10 略過；新增 26 個測試）
- 下一步：協調者收官；helper 資料庫位置定案後在 `main()` 開資料庫並傳入 `createServices(repositories)`
- Blocker：無

## 完成結果

- helper（`apps/helper/src/handlers/jobs/`）：`storage-service.ts` 的 `createJobsService(JobSnapshotRepository)` 實作建立／清單／單筆／修改／確認。新快照一律未確認、未改過，擷取方式照請求記錄且之後不能改；`jobs.update` 內容有變才記為使用者改過並清除確認（內容相同視為沒改、確認保留）；確認時間由 helper 決定。查不到的 ID 回 `invalid_request`（固定訊息，不回填 ID）。`JobsService` 新增的四個方法標為選用：沒提供時 handler 回 `not_implemented`（P1-T041 分派表測試的假服務只有 `submitCapture`）。
- `main.ts`：`createServices(repositories?)`，傳入 storage repositories 才接上 jobs；`main()` 目前不開資料庫（位置未定案），所以實際執行時 jobs.* 仍回 `not_implemented`。
- editor（`apps/editor/src/pages/jobs/`）：`JobsPage`（清單＋模式切換）、`SnapshotList`、`SnapshotDetail`（來源資訊、確認狀態、修改、確認）、`ManualPasteForm`、共用 `FieldsEditor`、`draft.ts`（表單草稿↔`JobFields`）、`labels.ts`、`jobs.css`。
  - 擷取方式只顯示「自動擷取／手動貼上」照實；手動貼上表單固定送 `manual_paste`，畫面也標「手動貼上」。
  - 選用欄位空白時，畫面以不同標籤標示「未擷取到」或「頁面未提供」，使用者可切換；手動貼上預設「未擷取到」（不替頁面斷言沒提供）。
  - 有未儲存修改時不能確認；儲存後提示要重新確認；確認狀態顯示「尚未確認：確認前不能用於產生履歷」或「已確認，可用於產生履歷」。
  - 職缺內容一律純文字（React 文字節點與表單值），來源網址只顯示文字、不做成連結（D6）。
  - 頁面保留一則 `role="note"`：自動擷取尚未實作（P1-T018 blocked），目前用手動貼上；App.test 的「尚未實作」斷言因此仍成立。
- 測試：`handlers/jobs/jobs.test.ts`（經 dispatch＋記憶體 SQLite，13 個）、`pages/jobs/draft.test.ts`（5 個）、`pages/jobs/JobsPage.test.ts`（8 個，假 transport 見 `fake-bridge.test-helpers.ts`）。
- 手動驗證：無（Task 未要求）；在真實擴充功能頁操作需 helper 接上資料庫後才可能。
- 待裁定：helper 資料庫檔案位置與開啟時機（影響 T019／T020／T021 等所有需要 storage 的服務）；「快照確認後才能用於生成」的生成端檢查由 `resume.generate`（P1-T025）負責，本 Task 只提供 `confirmedAt` 與畫面標示。
