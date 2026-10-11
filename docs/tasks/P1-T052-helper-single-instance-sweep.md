---
id: P1-T052
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/storage/src/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/services/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "packages/contracts/src/bridge/", "docs/specs/bridge.md"]
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：無

## 完成結果

