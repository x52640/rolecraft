---
id: P1-T058
phase: 1
status: in_progress
depends_on: []
specs: ["sources-and-authorization.md", "providers.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/storage/src/migrations/", "packages/storage/src/repositories/", "packages/storage/src/schema/", "packages/storage/src/index.ts", "packages/storage/src/migrate.test.ts", "packages/sources/src/registry.ts", "packages/sources/src/registry.test.ts", "packages/sources/src/index.ts", "packages/sources/src/folder-identity.ts", "packages/sources/src/folder-identity.test.ts", "packages/providers/src/claude/version-gate.ts", "packages/providers/src/claude/version-gate.test.ts", "packages/providers/src/index.ts", "apps/helper/src/handlers/sources/", "apps/helper/src/handlers/providers/", "apps/helper/src/handlers/messages/claude-engine.ts", "apps/helper/src/handlers/messages/claude-engine.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "docs/specs/sources-and-authorization.md", "docs/specs/providers.md"]
contract_change: none
expected_commit: "feat(P1-T058): helper：授權資料夾、選定模型、已驗證 Claude 版本存進資料區"
---

# helper：授權資料夾、選定模型、已驗證 Claude 版本存進資料區

## 目標

目前授權資料夾、選定的 Claude 模型、執行檢查紀錄、自動重新驗證通過的 Claude 版本都只在 helper 記憶體裡，瀏覽器一重開 helper 就全部忘記（RESIDUALS「授權集合…只在 helper 記憶體」）。本 Task 把這些存進資料區，讓擁有者能實際測試。

## 範圍

### 包含

- 授權資料夾：新 migration（例如 `authorized_folders`：不透明 ID、絕對路徑、顯示名稱、授權時間）＋ repository；helper 有 storage 時，`sources` 服務的新增、移除、授權變更寫入資料庫，啟動時還原（路徑已不存在或已不是資料夾的照常列出、標示不可讀，不自動刪）。不透明 ID 跨重啟不變
- 讀取紀錄（R4「每次讀取記錄路徑、時間、雜湊供驗收」）：append-only 表＋寫入；不提供刪除
- 選定模型：存「模型」而不是每次啟動隨機產生的候選 ID；啟動時對回目前候選。`provider_connections`、`run_check_records` 既有 repository 接上（狀態與執行檢查紀錄寫入）。重啟後狀態仍視為「需重新檢查」（不沿用舊的 available），選定模型保留
- 已驗證 Claude 版本：實作 `ClaudeVersionStore`（存資料區），helper 建 Claude 服務時傳入（`claude-probe.ts`、`messages/claude-engine.ts` 兩處）；只有通過自動重新驗證的版本才寫入，ADR-0002 版本永遠接受
- 沒有 storage（未設資料區）時行為維持現狀（全在記憶體）
- spec 補一句持久化規則（sources-and-authorization、providers）

- 對抗驗證（2026-10-11）屬實項：
  - 重啟還原不比對資料夾身分：原路徑換成符號連結或別的資料夾，重啟後未經確認就讀到 → 存加入時的 realpath 與 (dev, ino)，還原後第一次開啟不一致就整個資料夾不可讀、項目降為待確認（0005 尚未推出，可直接改）
  - 撤銷／移除寫資料區失敗：記憶體已撤銷、資料庫仍授權，重啟後又可讀；移除失敗後同路徑無法再加入 → 撤銷、移除改為先寫資料區成功才生效（失敗回錯誤、記憶體不變）；加入時資料庫已有同路徑就沿用
  - 資料區占用接手後沿用的 sources 沒接資料區（不寫讀檔紀錄、撤銷不落地）→ 接手時接上資料區（合併記憶體授權、還原資料庫已有資料夾、接上讀檔紀錄）
  - 選定模型寫入失敗被吞掉、重啟後回到舊模型 → 先寫資料區成功才更新選定，失敗回錯誤
  - 短驗證的 R6 紀錄寫入失敗被吞掉 → 失敗時這次驗證視同失敗、不記選定（與 draft-job、generation 一致）

### 不包含

- 匯入暫存（`import.*`）持久化：重開後重選 PDF 即可，維持記憶體（記入殘餘）
- 分析流程（P1-T060）、`source_documents` 同步（P1-T060）

## 工作區與 Context

### 必讀入口

- `docs/RESIDUALS.md`「授權集合」那一項
- P1-T021、T030、T039、T052 完成結果
- `apps/helper/src/main.ts` 的 `createServices`（資料區占用接手時 providers／sources 沿用 base）
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R4 授權、R6 供應商），收官前跑對抗驗證
- 每項附測試；重啟還原用同一個資料庫開兩次 createServices 驗證
- 不改 contracts
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；helper 原始碼 R7 靜態掃描不放寬（helper 內不得直接用 fs／child_process）

## 驗證

### 自動驗證

- 重啟後授權資料夾、選定模型、已驗證版本都還在；ID 不變
- 未設資料區時行為不變
- 讀取紀錄只增不刪

### 手動驗證

- 無（擁有者整體測試時一併確認）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：migration 0005＋四個 repository、registry 還原、sources／providers 保存接上、ClaudeVersionStore、main.ts 組裝、spec 補句
- 已通過驗證：worktree 內 `npm run verify` 綠（vitest 2857 passed／13 skipped）
- 下一步：協調者收官（範圍稽核、對抗驗證）
- Blocker：無

## 完成結果

- storage：`0005_helper_state.sql` 新增 `authorized_folders`、`authorized_folder_items`（只存確認／撤銷過的文件）、`source_read_log`（觸發器擋 UPDATE／DELETE）、`provider_selections`（存模型別名）、`claude_version_records`（擋 UPDATE）；對應 repository 掛進 `createRepositories`。
- sources：`SourceRegistry.restoreFolder` 沿用資料夾／文件 ID 與授權狀態，不列舉不讀檔；helper `sources/persistence.ts` 以 lazy 開資料夾還原，路徑失效照常列出、預覽回 unreadable、不自動刪。新增資料夾先寫資料區才算加入；授權先寫資料區才生效，撤銷先生效再寫；讀檔紀錄寫不進去該次讀取丟錯、不交出內容。
- providers：`providers/persistence.ts` 接 `provider_connections`、`run_check_records`、`provider_selections`；重啟時選定模型以別名對回本次候選 ID，狀態維持初始的需重新檢查。寫入失敗不影響記憶體狀態。
- 已驗證版本：`jsonClaudeVersionStore`（providers 套件）＋`claude_version_records`；helper 建一個接保存的 Claude 服務（`createHelperClaudeService`），probe 與草稿／履歷生成端經 `claudeServiceOf` 共用同一個版本閘門。閘門語意不變：只有 verified 紀錄的版本被接受，ADR-0002 版本永遠接受；暫定失敗與失敗紀錄照 P1-T039 設計一併保存（重啟後仍停用）。
- 沒有資料區：全在記憶體，行為不變（main.test 驗證兩次 createServices 互不相干）。
- 範圍外改動：`packages/storage/src/migrate.test.ts` 的資料表清單加入 0005 的五張表（新增 migration 的必然結果，不改會讓 verify 失敗）。
- 殘餘：資料區被占用後接手時，沿用的 base providers／sources 仍只在記憶體（不寫資料區）；撤銷或移除資料夾寫資料區失敗時記憶體已生效、資料區仍是舊狀態，重啟後會回到舊授權（操作本身回錯誤）；匯入暫存仍只在記憶體（依範圍）。
- 手動驗證：無（擁有者整體測試時一併確認）。
