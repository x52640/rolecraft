---
id: P1-T058
phase: 1
status: in_progress
depends_on: []
specs: ["sources-and-authorization.md", "providers.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/storage/src/migrations/", "packages/storage/src/repositories/", "packages/storage/src/schema/", "packages/storage/src/index.ts", "packages/sources/src/registry.ts", "packages/sources/src/registry.test.ts", "packages/sources/src/index.ts", "packages/providers/src/claude/version-gate.ts", "packages/providers/src/claude/version-gate.test.ts", "packages/providers/src/index.ts", "apps/helper/src/handlers/sources/", "apps/helper/src/handlers/providers/", "apps/helper/src/handlers/messages/claude-engine.ts", "apps/helper/src/handlers/messages/claude-engine.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "docs/specs/sources-and-authorization.md", "docs/specs/providers.md"]
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：

## 完成結果

