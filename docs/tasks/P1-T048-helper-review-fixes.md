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

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：三項修正與回歸測試（2026-10-11）
- 已通過驗證：`npm run verify` 綠；三個回歸測試在修正前皆失敗、修正後通過
- 下一步：協調者合併
- Blocker：無

## 完成結果

- **P1-T029 訊息意圖**：`requestDraft` 等完 AI 服務後重新讀取訊息，只把 `replyIntent` 寫進最新內容，不再用等待前的快照蓋掉期間存的草稿；訊息在等待期間被刪除則回 `not_found`。回歸測試：`messages.test.ts`「等待 AI 服務期間使用者存了草稿：記錄意圖時不蓋掉」（用可控的 resolveEngine 延遲）。
- **P1-T023 否決失敗可重試**：仍先在自己的交易移除專案引用、再刪素材（`deleteMaterial` 不能放進外層交易）；刪除丟錯且事實項仍在時，於一個交易內把引用加回原本專案的原位置，再把原錯誤往外丟（回 `internal_error`）。若事實項已刪掉（例如提交後清 PDF 才失敗）就不加回。回歸測試：`claims-review.test.ts` 刪除失敗案例改為斷言引用順序還原、`claims.list` 仍列出該事實項，重試可完成。
- **P1-T025 啟動回收**：`pauseInterruptedJobs` 的列出與存檔包進同一個 `transaction`；中途失敗整批回滾。回歸測試：新增 `resume/pause-interrupted.test.ts`（以暫存 trigger 讓第二筆存檔失敗，斷言第一筆未被改）。
- 保守選擇：沒有加鎖；多個 helper 共用同一資料區時「正在執行的工作被另一個 helper 啟動時改成暫停」仍待擁有者裁定。手動驗證不需要。
