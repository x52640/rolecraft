---
id: P1-T006
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["architecture.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/"]
contract_change: none
expected_commit: "feat(P1-T006): storage：SQLite schema 與 repository"
---
# storage：SQLite schema 與 repository

## 目標

所有資料存本機、可追溯。

## 範圍

### 包含

- `node:sqlite` 連線與 migration 機制（版本表）
- 核心物件的 repository（Profile、SourceDocument、Claim、ProjectEvidence、JobSnapshot、ResumeVersion、MessageDraft、ProviderConnection、RunCheckRecord、WorkJob／WorkUnit）
- 檔案儲存區（PDF 等）介面

### 不包含

- 不可變匯出版本與投遞（P1-T007）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/architecture.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每個 repository 一個檔；SQL 與對應不得塞在同一個巨型檔
- 讀寫時用 contracts schema 驗證
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 以暫存資料庫跑 repository 測試；migration 可從空庫重建

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
