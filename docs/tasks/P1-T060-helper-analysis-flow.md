---
id: P1-T060
phase: 1
status: in_progress
depends_on: ["P1-T058"]
specs: ["bridge.md", "runtime-and-budget.md", "evidence-model.md", "sources-and-authorization.md", "providers.md"]
track: helper
primary_repo: rolecraft
write_paths: ["docs/specs/bridge.md", "packages/contracts/src/bridge/", "packages/contracts/src/index.ts", "apps/helper/src/handlers/analysis/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "packages/storage/src/repositories/", "packages/storage/src/index.ts", "apps/editor/src/pages/projects/", "apps/editor/src/pages/claims/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T060): helper：分析授權資料夾產生事實項、查詢進度與手動續跑"
---

# helper：分析授權資料夾產生事實項、查詢進度與手動續跑

## 目標

分析流程（`planAnalysis`、`createAnalysisRunner`）已在 pipeline 完成，但 helper 沒有任何操作會啟動它，事實項清單永遠是空的，履歷無從產生。本 Task 把它接進 helper 並在編輯器提供按鈕，同時補上 D21 的進度查詢與手動續跑。

## 範圍

### 包含

- bridge.md 先定規則，再改 contracts、分派表：
  - `analysis.start`：對目前授權集合做增量分析；已有暫停中的分析工作就改為續跑（續跑前重做 R6，D21 只由使用者觸發）；已有執行中的就回同一個工作 ID；回 `{ workJobId }`
  - `analysis.status`：回最近一次分析工作的狀態（執行中／完成／暫停原因／被擋）、已完成與總單元數、新增或更新的事實項數
- helper `handlers/analysis/`：
  - 列舉授權資料夾 → 同步 `source_documents`（新增、內容變更、刪除、撤銷授權），只讀授權集合（R4）
  - `planAnalysis` 的輸入從資料庫組（已分析版本、既有事實項、全域摘要）；`claimUpdates`（撤銷、重新授權恢復，含 P1-T053 `revocationHold`）要寫回
  - `commitUnit` 在**同一個交易**寫事實項、`claimUpdates` 與工作狀態（RESIDUALS P1-T046）
  - 執行走 providers 既有的訂閱檢查包裝（R5、R6），模型用 P1-T058 保存的選定模型；未選定或不可用回對應失敗、不呼叫模型
  - 工作狀態存資料庫（`work_jobs`、`work_units`），helper 重開後 `analysis.status` 仍查得到；重開後不自動續跑
- 編輯器：專案頁（資料夾授權所在頁，`pages/projects/`）加「分析資料夾」按鈕與進度／暫停原因顯示（暫停時按鈕變「繼續分析」）；事實項頁完成後重新整理
- 測試一律用假 provider，不呼叫真實 CLI

### 不包含

- 履歷產生、訊息草稿的進度查詢（沿用現況）
- ProjectEvidence 產生來源
- 自動續跑（D21 禁止）

## 工作區與 Context

### 必讀入口

- P1-T022、T046、T053、T058 完成結果
- `packages/pipeline/src/analysis/`（`index.ts`、`plan.ts`、`runner.ts` 開頭註解）
- `apps/helper/src/handlers/resume/generation.ts`（已接好的生成流程，照同樣模式）
- `docs/RESIDUALS.md` 中 P1-T046、P1-T053 的項目
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R4、R5、R6、evidence-model），收官前跑對抗驗證
- contracts 只做相加變更（additive）
- 協調者例外允許本 Task 改 contracts、分派表、`handlers/services.ts`（worker 規則 10 對本 Task 不適用）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；helper 原始碼 R7 靜態掃描不放寬（helper 內不得直接用 fs／child_process）

## 驗證

### 自動驗證

- 端到端（假 provider、暫存資料區）：授權資料夾 → `analysis.start` → 事實項寫入 → `analysis.status` 完成
- 暫停（額度不足）→ 重開 helper → 狀態仍在、不自動續跑 → `analysis.start` 續跑從未完成單元開始
- 撤銷授權後再分析：相關事實項標來源已移除；同 hash 重新授權恢復
- commitUnit 中途失敗不留下半套資料

### 手動驗證

- 擁有者用自己的資料夾跑一次（需擁有者，P1-T032 一併）

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

