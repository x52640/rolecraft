---
id: P1-T044
phase: 1
status: in_progress
depends_on: []
specs: ["providers.md", "runtime-and-budget.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/providers/src/claude/service.ts", "packages/providers/src/claude/service.test.ts", "packages/providers/src/claude/reverify.ts", "packages/providers/src/claude/reverify.test.ts", "packages/providers/src/claude/constants.ts", "packages/storage/src/application/storage-sweep.ts", "packages/storage/src/application/storage-sweep.test.ts", "apps/helper/src/handlers/providers/providers-service.ts", "apps/helper/src/handlers/providers/providers.test.ts"]
contract_change: none
expected_commit: "fix(P1-T044): providers／storage：Claude 版本驗證逾時與取消、清理失敗不中斷、額度狀態"
---

# providers／storage：Claude 版本驗證逾時與取消、清理失敗不中斷、額度狀態

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T039：`run()` 在 `ensureVersion` 之前先檢查 `request.signal` 已取消就回 cancelled（不要把使用者的 signal 傳進重新驗證，否則取消會被記成驗證失敗而永久停用）
- P1-T039：重新驗證的每次 launch 加執行逾時（常數放 constants.ts，逾時中止行程群組並記為驗證失敗），避免卡在 reverifying
- P1-T040：`storage-sweep.ts` 刪除已清除 PDF 失敗時，仍要繼續跑孤兒清理，最後再拋合併的 StorageError
- P1-T030：自動重新整理不能蓋掉另一個候選剛設的 quota_exhausted；最保守做法：Claude 同一時間只允許一個驗證進行（不同候選在進行中回 not_available）

### 不包含

- 已被後續修正解決、已知殘餘或需擁有者裁定的項目（見 docs/CURRENT_TASK.md）

## 工作區與 Context

### 必讀入口

- 範圍內各項提到的原 Task 檔完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（R6、D19），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

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

