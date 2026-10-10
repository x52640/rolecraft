---
id: P1-T006
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["architecture.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/"]
contract_change: additive
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

- 最後完成：migration 機制、0001 核心 schema、10 個 repository、檔案儲存區、ID／時間／雜湊格式定案
- 已通過驗證：`npm run verify` 綠（Vitest 18 檔 108 測試；storage 5 檔 31 測試）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- `packages/storage/src/`：`database.ts`（`openDatabase`：`node:sqlite`、外鍵開、WAL、開啟即 migrate）、`migrate.ts`＋`migrations/0001_core.sql`、`transaction.ts`（SAVEPOINT，可巢狀）、`ids.ts`（`newId`／`nowTimestamp`／`sha256Hex`）、`errors.ts`、`repositories/`（每物件一檔＋共用 `json-table.ts`、`createRepositories`）、`files/file-store.ts`（`FileStore` 介面＋本機 SHA-256 內容定址實作）。
- migration：`src/migrations/NNNN_名稱.sql` 依版本套用，記在 `schema_migrations`（含 checksum）；後續 Task 新增下一號檔案即可，不改既有檔。已套用檔被改、資料庫版本比程式新 → 拒絕開啟；單一 migration 失敗整個回滾。
- 資料表：每表「索引欄＋`data` JSON」，寫入前與讀出後都用 contracts schema 驗證（讀出不合規拋 `StorageError`）。外鍵：ResumeVersion／MessageDraft → JobSnapshot；`claim_sources` 反查事實項引用的來源文件（R2 用）；`work_units` 隨 WorkJob 整筆交易替換。RunCheckRecord 只新增（觸發器擋 UPDATE、同 ID 不可重複）。ProviderConnection 以服務為鍵。
- ADR-0006 第 1 項定案：產生端 ID＝UUID v4 小寫、時間＝UTC 毫秒 `Z`、雜湊＝SHA-256 小寫 hex；contracts 新增 `CanonicalId`／`CanonicalTimestamp`／`Sha256Hash`（additive），讀取用的 `Id`／`Timestamp`／`ContentHash` 維持寬鬆。
