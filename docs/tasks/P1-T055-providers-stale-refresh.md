---
id: P1-T055
phase: 1
status: done
depends_on: []
specs: ["providers.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/providers/"]
contract_change: none
expected_commit: "fix(P1-T055): providers：逾時後的過期驗證不再覆寫狀態"
---

# providers：逾時後的過期驗證不再覆寫狀態

## 目標

codex review 補審 P1-T044～T054（2026-10-11，17 個程式 commit）後，協調者對照目前主線（c11dcff）確認仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T044（1262dbe）：`providers-service.ts` 的 `verify()` 只在 `verifyModel` 回來後檢查一次 `stale()`。被擋時呼叫的 `refresh()` 若卡過槽位硬期限，期間另一個候選已寫入 `quota_exhausted`；舊的 `refresh()` 回來仍會 `update`，之後再蓋成 `eligibility_unknown`。修法：過期的驗證不寫任何狀態——自動重新檢查的結果在寫入前、以及其後每次寫入前都要再檢查 `stale()`（使用者主動 `recheck` 不受影響）

### 不包含

- 已被後續 commit 修好的發現、已知殘餘（docs/RESIDUALS.md）

## 工作區與 Context

### 必讀入口

- `docs/tasks/P1-T044-*.md` 完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（providers 狀態），收官前跑對抗驗證
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

- 最後完成：`verify()` 被擋後的自動重新檢查回來先檢查 `stale()`，過期整次不寫狀態
- 已通過驗證：`npm run verify` 綠（2764 測試通過）；協調者對抗驗證（2 個角度）無發現
- 下一步：協調者審查、合併
- Blocker：無

## 完成結果

1. **過期的自動重新檢查不寫狀態**（`apps/helper/src/handlers/providers/providers-service.ts`）：把 `refresh()` 拆成 `probe.check()` 與 `applyCheck()`；`verify()` 被擋時改成先等 `probe.check()`，回來後先檢查 `stale()`，已過硬期限就直接回 `unknown`，不套用檢查結果、不寫 `eligibility_unknown`、不記選定。檢查之後到 return 之間沒有 `await`，其後的寫入都落在同一個未過期時點。使用者主動 `recheck` 仍走 `refresh()`，行為不變。
2. **回歸測試**（`providers-slot.test.ts`）：候選 A 驗證被擋、重新檢查卡住過硬期限；候選 B 接著寫入 `quota_exhausted`；卡住的檢查晚到「成功」或「失敗」兩種情況都不能蓋掉 `quota_exhausted`。修正前兩案都失敗（狀態被蓋成 `eligibility_unknown`）。

對抗驗證：只做了自我檢查（逐一確認 `verify()` 內每個 `await` 之後的寫入都有 `stale()` 把關），沒有另開 agent。
