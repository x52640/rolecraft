---
id: P1-T048
phase: 1
status: in_progress
depends_on: []
specs: ["jobs-and-messages.md", "evidence-model.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/messages/storage-service.ts", "apps/helper/src/handlers/messages/messages.test.ts", "apps/helper/src/handlers/claims/storage-service.ts", "apps/helper/src/handlers/claims/claims-review.test.ts", "apps/helper/src/handlers/resume/assemble.ts", "apps/helper/src/handlers/resume/"]
contract_change: none
expected_commit: "fix(P1-T048): helper：訊息意圖不蓋掉並行編輯、刪除失敗可重試、啟動回收原子化"
---

# helper：訊息意圖不蓋掉並行編輯、刪除失敗可重試、啟動回收原子化

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T029：`requestDraft` 等待引擎後用舊快照存檔，蓋掉期間存的使用者編輯 → await 後重新讀取再只更新 replyIntent
- P1-T023：刪除素材失敗時專案參照已移除，事實項從清單消失、無法重試 → 失敗時把參照加回去並回報錯誤
- P1-T025：啟動時回收中斷工作的「列出＋存檔」不在同一交易，可能蓋掉同時完成的工作 → 包進同一個 transaction（多 helper 共用資料區的完整處理待擁有者裁定）

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
- 中風險，不跑對抗驗證
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

