---
id: P1-T052
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/storage/src/lock/", "packages/storage/src/application/", "packages/storage/src/files/", "packages/storage/src/index.ts", "packages/storage/src/index.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/services/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "packages/contracts/src/bridge/", "docs/specs/bridge.md"]
contract_change: additive
expected_commit: "feat(P1-T052): helper：一個資料區只准一個 helper、孤兒 PDF 刪不掉不擋啟動"
---

# helper：一個資料區只准一個 helper、孤兒 PDF 刪不掉不擋啟動

## 目標

實作擁有者 2026-10-11 的裁定（見 docs/CURRENT_TASK.md「擁有者已裁定」）。

## 範圍

### 包含

- 擁有者裁定 #13：同一資料區同時只准一個 helper。在 storage 套件實作資料區鎖（helper 原始碼仍不得用 fs／child_process）：開啟 runtime 時取得鎖，已被另一個仍存活的 helper 持有就不開儲存；殘留的鎖（持有者已結束）要能接手。第二個 helper 不退出，對需要儲存的操作回固定訊息「RoleCraft 正在另一個瀏覽器使用中，請先關閉該瀏覽器的 RoleCraft」，錯誤碼沿用既有代碼（優先 `helper_unavailable`，並在 bridge.md 錯誤碼表註明 helper 也會產生），不新增錯誤碼
- 擁有者裁定 #14：啟動清理時，已清除素材（D19）的 PDF 刪不掉仍擋啟動；一般孤兒 PDF 刪不掉只記錄（不含路徑的固定日誌）、照常啟動，下次清理再試

### 不包含

- 其他待裁定項目

## 工作區與 Context

### 必讀入口

- specs 欄位列的 spec；docs/CURRENT_TASK.md「擁有者已裁定」

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附測試（先寫會失敗的測試再實作）
- 高風險（R7 檔案、D19），收官前跑對抗驗證；不得放寬 helper 的 R7 靜態掃描
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：#13 資料區鎖＋占用時的閘門、#14 孤兒 PDF 刪不掉不擋啟動，含測試與 bridge.md
- 已通過驗證：worktree 內 `npm run verify` 綠（2730 測試通過、13 略過）
- 下一步：協調者對抗驗證與收官
- Blocker：無

## 完成結果

- **#13 一個資料區只准一個 helper**
  - `packages/storage/src/lock/data-dir-lock.ts`：`tryAcquireDataDirLock`。鎖檔 `rolecraft.instance.lock` 是專用 SQLite 檔，開 `BEGIN EXCLUSIVE` 不提交；底層是作業系統檔案鎖，持有行程結束（含當掉、SIGKILL）即自動放鎖。
  - `apps/helper/src/services/runtime.ts`：`openHelperRuntime` 先取鎖再開資料庫；鎖被占用拋 `DataDirInUseError`，不開資料庫、不清掃；失敗與 `close()` 都放鎖。
  - `apps/helper/src/services/data-dir.ts`：`connectDataDir`＋`resolveServices`。被占用時 helper 不退出；`providers.*`、`sources.*` 照沒有資料區時運作；其餘操作回 `helper_unavailable`，訊息固定為「RoleCraft 正在另一個瀏覽器使用中，請先關閉該瀏覽器的 RoleCraft」。`handlers/registry.ts` 在每個 handler 外包這層閘門。
  - 錯誤碼沿用 `helper_unavailable`，contracts 沒改；bridge.md 錯誤碼表註明 helper 也會產生。
- **#14 啟動清掃**
  - `storage-sweep.ts` 新增 `OrphanPdfSweepError`（StorageError 子類，帶這次已完成的清掃結果）。只有一般孤兒 PDF 刪不掉時拋它；runtime 記錄後照常啟動，日誌是固定事件 `orphan_pdf_sweep_failed`，不含路徑或雜湊，下次清掃再試。
  - D19 補刪版本的 PDF 刪不掉、或兩種都失敗時，照舊拋一般 StorageError 擋啟動。
- **測試**：鎖（同行程、兩行程、SIGKILL 後接手、錯誤分流）；runtime 鎖與清掃分流；閘門（逐操作分類、接手、接手失敗放鎖、沿用記憶體狀態）；真實子行程兩個 helper 共用資料區；資料夾唯讀造成孤兒刪不掉時照常上線、恢復後刪掉。

**保守選擇**

- 鎖改用 SQLite／作業系統檔案鎖，不用 pid 鎖檔：不需判斷殘留鎖或接手，也沒有 pid 重用造成的誤判。
- 被占用的 helper 只在收到需要儲存的操作時才再試取鎖（不等、不輪詢）。接手時開庫或清掃失敗，就回 internal_error、放鎖，下次再試。
- 啟動時最多等 2 秒讓對方放鎖，涵蓋同一瀏覽器重連的短暫重疊。
- 只有「刪檔失敗」才算一般孤兒失敗；列舉檔案區失敗照樣擋啟動。
- 接手後沿用占用期間的 providers、sources 實例，已選定的模型與已加入的資料夾不會消失。
- 新日誌事件沒有加進 `bridge/logger.ts`（不在 write_paths），改由 `services/notice.ts` 寫同格式的固定事件行。

**已知殘餘／需擁有者或協調者裁定**

- 編輯器 `pages/messages/labels.ts`、`pages/projects/failure-text.ts` 把 `helper_unavailable` 改寫成「連不到本機輔助程式」，使用者在這兩頁看不到裁定 #13 的訊息。要另開編輯器 Task 改成顯示 helper 的固定訊息。
- `deleteMaterial`／刪投遞紀錄：交易提交後 PDF 才刪，刪不掉留下的檔在啟動時與一般孤兒無法區分，會依 #14 只記錄、不擋啟動。要擋需要新增「待刪 PDF」紀錄（migration），不在本 Task 範圍。
- 舊 helper 在連線結束後若還在跑背景工作，會持續持有鎖；這段期間同一瀏覽器新起的 helper 也會顯示「另一個瀏覽器使用中」。舊 helper 結束後的下一個需要儲存的操作會自動接手。
- 鎖檔被外部換成非 SQLite 檔時，helper 以設定錯誤結束（結束碼 1）；資料區在網路磁碟時檔案鎖不可靠，不支援。
- 手動驗證（兩個真實瀏覽器同時開）需要擁有者，未做；已用真實子行程測試涵蓋。

