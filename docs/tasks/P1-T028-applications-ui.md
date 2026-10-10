---
id: P1-T028
phase: 1
status: in_progress
depends_on: ["P1-T027", "P1-T041"]
specs: ["resume-output.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/applications/", "apps/helper/src/handlers/applications/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T028): editor：投遞紀錄"
---
# editor：投遞紀錄

## 目標

F09、R3：記錄實際投出的版本。

## 範圍

### 包含

- 新增主動投遞／受邀、日期、狀態
- 實際投出只能選匯出版本
- 刪除素材時顯示保留的已投遞版本數（D19）

### 不包含

- 站內履歷外部版本（D20 待驗證後另開）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- 相依 Task 的「完成結果」：P1-T027

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 匯出≠投遞
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

- 最後完成：helper applications 服務與 handler、editor 投遞頁與測試
- 已通過驗證：`npm run verify`（Vitest 1866 通過、10 略過）
- 下一步：協調者收官；P1-T040 的 storage 服務組裝合併後，在 `createServices` 接上 applications（見下）
- Blocker：無

## 完成結果

- helper（`apps/helper/src/handlers/applications/`）：
  - `service.ts`：`ApplicationsService` 的 `list`／`create`／`update`／`delete`，回 `{ ok, value }` 或拒絕原因；方法皆選填，服務缺方法時該操作回 not_implemented。
  - `storage-service.ts`：`createApplicationsService({ applications, exportVersions })` 以 storage repository 實作。新增前確認匯出版本存在（R3）；修改時實際投出版本必須與原紀錄相同，不同回拒絕（storage 觸發器也擋）；投遞日期統一存 UTC（storage 依字串排序）；刪除走 `ApplicationRecordRepository.delete`（D19 連帶清理由 storage 處理）。
  - handler：拒絕原因一律轉 `invalid_request`＋固定訊息（`rejections.ts`），不回填請求內容。
- `apps/helper/src/main.ts` 未改：helper 目前沒有開啟 storage 的地方，資料庫與檔案區由 P1-T040 的 `apps/helper/src/services/` 負責。P1-T040 合併後在 `createServices` 加一行：`applications: createApplicationsService({ applications: <ApplicationRecordRepository>, exportVersions: <ExportVersionRepository> })`。
- editor（`apps/editor/src/pages/applications/`）：
  - 新增表單：主動投遞／對方邀約、投遞日期（當地日期取正午轉時間戳記）、狀態（自由文字＋建議清單）、實際投出版本（只能從 `export.list_versions` 選）。匯出版本讀不到或還沒有匯出版本時不顯示表單。
  - 清單：每筆顯示日期、起因、狀態、實際投出版本；修改時版本只顯示、不能改；刪除要再按一次確認，並說明匯出版本可能依 D19 連帶刪除。
  - 已投遞版本數（D19）：顯示不重複的已投遞匯出版本數，說明刪除素材時這些會保留副本、未投遞的整份刪除。
  - 頁面文字明示匯出不等於投遞、RoleCraft 不代為投遞（D7）；站內履歷投遞（D20）標為尚未實作。
- 測試：helper handler（假 repository＋真實空資料庫）、editor 頁面（假通道）與日期／計數純函式。
- 限制：橋接沒有「刪除素材」操作，所以「刪除素材當下顯示保留數」目前只能在投遞頁常駐顯示；之後新增素材刪除操作時，回應應帶 `deleteMaterial` 的 `retainedExportVersionIds` 數量，由該 UI 顯示。
