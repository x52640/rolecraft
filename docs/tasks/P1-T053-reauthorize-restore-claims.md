---
id: P1-T053
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md", "sources-and-authorization.md"]
track: domain
primary_repo: rolecraft
write_paths: ["docs/specs/evidence-model.md", "packages/domain/src/source-change/", "packages/pipeline/src/analysis/plan.ts", "packages/pipeline/src/analysis/plan.test.ts", "packages/contracts/src/entities/claim.ts", "packages/contracts/src/entities/entities.test.ts", "packages/storage/src/repositories/", "packages/storage/src/migrations/", "packages/storage/src/migrate.test.ts", "packages/domain/src/evidence/actions.ts", "packages/domain/src/evidence/actions.test.ts", "apps/helper/src/handlers/claims/storage-service.ts", "apps/helper/src/handlers/claims/edited-text.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T053): 事實項：重新授權且內容未變時恢復原狀態"
---

# 事實項：重新授權且內容未變時恢復原狀態

## 目標

實作擁有者 2026-10-11 的裁定（見 docs/CURRENT_TASK.md「擁有者已裁定」）。

## 範圍

### 包含

- 擁有者裁定 #15：文件撤銷授權後事實項變成 source_removed；之後重新授權同一來源、內容指紋（hash）與撤銷前相同時，事實項自動恢復成撤銷前的複核狀態，不呼叫模型。先在 evidence-model.md 補這條規則（只適用「僅因撤銷而變 source_removed」的事實項；撤銷期間文件內容變了、或事實項另有其他來源問題就不恢復）
- 若目前資料沒保存撤銷前的狀態，用最小、加法式的方式保存（contract_change additive），並說明舊資料（沒有保存值的）一律不恢復

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
- 高風險（R1、R2），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：evidence-model R2 補裁定 #15 規則；contracts 加選填 `revocationHold`；domain 判定保存／恢復；planAnalysis 套用；測試
- 已通過驗證：`npm run verify` 全綠（Vitest 2669 通過、13 略過；test:docs 15）
- 下一步：協調者對抗驗證
- Blocker：無

## 完成結果

- 規則：`docs/specs/evidence-model.md` R2 新增「擁有者裁定 #15」小節（保存條件、恢復條件、保留／清掉條件、舊資料不恢復）。
- 資料：現有資料無法分辨「撤銷」與「刪除」造成的來源已移除，也沒有撤銷當下的指紋，所以在 Claim 加選填 `revocationHold`（撤銷前狀態、各來源指紋、當時事實項文字與完成狀態）。事實項整筆以 JSON 存在 claims 表，不需要 migration；舊資料沒有此欄，一律不恢復。
- 實作：`packages/domain/src/source-change/revocation.ts`（保存與恢復判定），`evaluateClaimSources` 回傳 `revocationHold`（null＝清掉）；`planAnalysis` 的 claimUpdates 一併寫入或清掉。恢復只是重新判定，不重新分析文件、不呼叫模型。
- 保守選擇：
  - 只在「每個片段的來源都是已撤銷、片段綁的正是當下版本與指紋、沒有使用者確認」時保存；來源被刪除、待確認、混合情況都不保存。
  - 恢復要求每份來源都已授權、指紋與保存值相同、片段判定沒變、事實項文字與完成狀態沒改；有一份仍撤銷就保留保存值等待，其他情況一律清掉保存值。
  - 撤銷期間引用區塊沒變、只有文件其他部分變了（指紋不同）也不恢復，維持來源已移除並照 R2 重新分析該文件。
  - 已被使用者確認的事實項不保存也不恢復（維持「來源已移除」標示，依據是使用者確認）。
  - 中途變成「待確認」視同條件不符，清掉保存值。
  - 綁事實項內容是因為 helper 的修改內容動作（`withEditedText`，不在本 Task 範圍）會讓來源已移除的事實項維持原狀態；不綁的話改過的文字會在重新授權後被恢復成正常。
- 需擁有者裁定：已確認事實項重新授權後是否也要拿掉「來源已移除」標示（目前不動）；撤銷期間只有非引用區塊改變時是否允許恢復（目前不恢復）。
- 未改 ADR-0006（verify 不需要）；如要記錄此暫行欄位，需另開 Task。
- 對抗驗證修正（協調者）：撤銷期間確認或修改事實項（含改了又改回原文）原本仍保留保存值、重新授權後會恢復；改為 `confirmClaim` 與 helper `withEditedText` 一律清掉保存值，回歸測試在 `actions.test.ts`、`edited-text.test.ts`。
