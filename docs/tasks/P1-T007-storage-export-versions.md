---
id: P1-T007
phase: 1
status: in_progress
depends_on: ["P1-T006"]
specs: ["resume-output.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/src/export/", "packages/storage/src/application/", "packages/storage/src/index.ts", "packages/storage/src/migrations/"]
contract_change: additive
expected_commit: "feat(P1-T007): storage：不可變匯出版本、投遞紀錄與刪除規則"
---
# storage：不可變匯出版本、投遞紀錄與刪除規則

## 目標

R3、D19：投出去的版本要凍結，面試教練才拿得到當時內容。

## 範圍

### 包含

- ExportVersion 寫入後不可修改（repository 不提供 update；資料庫層 trigger 擋 UPDATE）
- ApplicationRecord 只能指向 ExportVersion
- 刪除素材：未投遞匯出版本整份刪除、已投遞保留並回報保留數（D19）
- 面試輸入讀取函式只讀匯出版本

### 不包含

- UI

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- 相依 Task 的「完成結果」：P1-T006

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不可變性要在資料庫層也擋，不只靠程式
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-12 情境測試：投遞後改履歷、快照、事實項並刪來源，面試輸入與投遞當時一致

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作與測試完成，待協調者收官（含對抗驗證）
- 已通過驗證：`npm run verify` 綠（Vitest 24 檔 181 測試）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- migration `0002_export_versions.sql`：`export_versions`、`application_records`（皆 STRICT＋WITHOUT ROWID，索引欄與 JSON 以 CHECK 綁定）、`export_version_ledger`（用過的匯出版本 ID，只增）、`deleted_materials`（D19 已刪素材紀錄）。
- 資料庫層不可變性（觸發器，不依賴 `PRAGMA foreign_keys`）：匯出版本禁 UPDATE；同 ID 只能 INSERT 一次（擋 INSERT OR REPLACE／REPLACE INTO／upsert／刪後同 ID 重建）；被投遞紀錄引用者禁 DELETE；投遞紀錄只能指向存在的匯出版本、同 ID 只能新增一次、不能改指向。觸發器被 DROP 時 `assertImmutabilityGuards` 讓 repository 拒絕開啟。
- `export/`：`createExportVersionRepository(db, fileStore)`（只有 create／get／list／isApplied／readPdf，無 update；create 存 PDF、產生 ID／時間／雜湊、依 claim_sources 填 `sourceDocumentIds`）。
- `application/`：`createApplicationRecordRepository`（create 驗證匯出版本存在；update 只改起因／日期／狀態；delete 整筆刪除，若該版本因此未投遞且含已刪素材副本就一併刪除）、`deleteMaterial(db, fileStore, {kind, id})`（同一交易刪原件、記錄、刪含其副本的未投遞版本；回報保留的已投遞版本）、`readInterviewInput`（只讀投遞紀錄＋匯出版本＋PDF，附已刪素材明示清單）。素材種類：claim、source_document、resume_version、job_snapshot。
- 會刪 PDF 檔的操作（deleteMaterial、投遞紀錄 delete）拒絕在外層交易中呼叫（檔案刪除無法回滾）；PDF 內容定址，仍被其他版本引用就不刪。
- contracts（additive）：`ExportVersion.sourceDocumentIds` 選填；ADR-0006 第 11 列更新。
- 偏離：改了 write_paths 外的 `packages/storage/src/migrate.test.ts`（原測試寫死只有 migration 1，新增 0002 必壞；改成依實際 migration 數計算，不改測試意圖）。

### 對抗驗證修正

四項發現驗證者皆判定 real=true，全部修正（沒有 real=false 的項目）：

1. （major）素材 repository 的 delete 繞過 D19 → `createRepositories` 的 sourceDocuments／claims／resumeVersions／jobSnapshots 不再提供 `delete`，`deleteMaterial` 是唯一刪除入口（測試鎖住公開 API）。縱深防禦：migration `0003_deleted_material_triggers.sql` 在四張素材表加 AFTER DELETE 觸發器寫 `deleted_materials`（繞過的 SQL 刪除仍會明示、刪投遞紀錄時仍會連帶清除）；觸發器列入 `assertImmutabilityGuards`。
2. （minor）`FileStore.delete` 可刪已投遞 PDF → 公開 `FileStore` 只剩 put／get／has；刪檔與列舉改由內部 `fileStoreInternals`（不匯出）提供，只經先查引用的 `releasePdfs`／孤兒清掃使用。
3. （major）素材刪除後 `exports.create()` 仍能複製 → create 先比對 `deleted_materials`（resumeVersionId、jobSnapshot.id、引用的 claimId、計算出的 sourceDocumentIds），命中就拋 StorageError、不寫 PDF。
4. （minor）commit 後刪 PDF 失敗／中斷、或外層交易回滾留下孤兒 PDF → 新增 `export/pdf-cleanup.ts`：`releasePdfs` 每個雜湊都嘗試、失敗最後一起拋；`sweepOrphanPdfs` 刪掉雜湊不在 export_versions 的檔案，`deleteMaterial` 與投遞紀錄 delete 提交後都會跑；create 拒絕在外層交易中呼叫。公開 `sweepStorage(db, fileStore)`（補刪含已刪素材的未投遞版本＋孤兒 PDF），**呼叫點：本機輔助程式啟動時呼叫一次**（helper 尚未接上，留給 helper 的 Task）。

- 回歸測試：`application/d19-hardening.test.ts`（含四項 PoC 情境）；既有測試改用 SQL／內部介面取代被移除的 delete。
- `npm run verify` 綠（Vitest 50 檔 691 測試）。

