---
id: P1-T044
phase: 1
status: done
depends_on: []
specs: ["providers.md", "runtime-and-budget.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/providers/src/claude/service.ts", "packages/providers/src/claude/service.test.ts", "packages/providers/src/claude/reverify.ts", "packages/providers/src/claude/reverify.test.ts", "packages/providers/src/claude/constants.ts", "packages/storage/src/application/", "apps/helper/src/handlers/providers/"]
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

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：四項修正與各自的回歸測試（每項先確認未修時測試失敗）
- 已通過驗證：worktree 內 `npm run verify` 全綠
- 下一步：協調者收官（範圍稽核、主環境重跑 verify、E3 對抗驗證）
- Blocker：無

## 完成結果

1. **取消不再觸發重新驗證**（`claude/service.ts`）：`run()` 一開始若 `request.signal` 已取消，就不讀版本、不重新驗證，直接交給 `runWithSubscriptionCheck` 回 `cancelled`（不啟動子程序）；`version` 回 `blocked`，原因為 `CANCELLED_BEFORE_VERSION`。使用者的 signal 仍刻意不傳進重新驗證。修正前，已取消的請求仍會跑完整的重新驗證。
2. **重新驗證每次啟動有執行逾時**（`claude/reverify.ts`、`claude/constants.ts`）：新增 `CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS = 120_000` 與 `timeoutLaunch`，每次 launch 各自一個 AbortController；逾時由 launcher 對行程群組送 SIGTERM、寬限期後 SIGKILL，並拋 `ReverifyTimeoutError`，該次重新驗證記為失敗、服務停用，不會卡在「重新驗證中」。測試用永不結束、忽略 SIGTERM 的假子程序加假計時器。
3. **清掃刪檔失敗不中斷**（`storage/application/storage-sweep.ts`）：補刪版本的 PDF 刪除失敗時，孤兒清掃照跑；兩段都跑完才拋一個 `StorageError`（cause 為 `AggregateError`）。
4. **額度狀態不被蓋掉**（`helper/handlers/providers/providers-service.ts`）：Claude 同一時間只允許一個短驗證；同一候選的並行請求仍合併成一次，不同候選在進行中回 `not_available`（handler 對應 `invalid_request`），不呼叫模型。

保守選擇：
- 重新驗證前的版本讀取（`service.ts` 的 `readVersion`）原本沒有加逾時；對抗驗證發現它會卡住驗證槽位，已在下方修正補上。
- 逾時常數取 120 秒（版本、auth 指令與 haiku 極短提示都遠低於此）。

對抗驗證修正（E3，2026-10-11）：
1. **驗證槽位必定釋放**（`helper/handlers/providers/claude-probe.ts`、`providers-service.ts`、`claude/service.ts`）：模型短驗證帶 `CLAUDE_MODEL_VERIFY_TIMEOUT_MS = 120_000` 的 signal 傳進 `verifyClaudeModel`（逾時取消回「無法確認」，不記為失敗）；`readVersion` 加 `CLAUDE_VERSION_READ_TIMEOUT_MS = 30_000`，卡住視為讀不到版本 → blocked。單一槽位另有硬期限 `CLAUDE_VERIFY_SLOT_DEADLINE_MS`（20 分鐘，大於自動重新驗證最壞耗時）：到期釋放槽位、回 `unknown`，那次驗證之後才回來的結果一律丟棄，不寫狀態、不記選定。回歸：verifyModel 永不結束，推進假計時器過硬期限後可選另一候選，且晚到的 quota_exhausted 不蓋掉狀態。
2. **逾時不等 close**（`claude/reverify.ts`、`constants.ts`）：`timeoutLaunch` 逾時先中止，再等 `CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS = 10_000`（涵蓋 launcher 的 SIGTERM→SIGKILL 寬限），仍沒結束就直接拋 `ReverifyTimeoutError`，不再等永遠不來的 close。`readVersion` 共用同一包裝。回歸：SIGKILL 後永不 close 的假子程序，重新驗證照樣結束並停用；`--version` 卡住時 `ensureVersion` 回 blocked、不進入重新驗證。
3. **清除 PDF 失敗可重試**（`storage/application/storage-sweep.ts`）：補刪改為一個版本一個交易，在交易內先刪資料列、再刪不再被引用的 PDF；刪檔失敗整個回滾、資料列保留，下次清掃仍走補刪路徑（不套孤兒寬限期）立即重試。仍被其他版本共用的 PDF 不刪。回歸：寬限期內連續兩次啟動清掃在刪檔失敗時都拋錯，故障排除後第三次刪掉；共用 PDF 的版本補刪後檔案保留。
4. 手動重新檢查會清掉 quota_exhausted：確認為設計行為，不改。
