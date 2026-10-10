---
id: P1-T039
phase: 1
status: in_progress
depends_on: ["P1-T012", "P1-T037"]
specs: ["providers.md"]
track: providers
primary_repo: rolecraft
write_paths: ["packages/providers/src/claude/", "packages/providers/src/index.ts", "docs/adr/0002-claude-cli-isolation.md"]
contract_change: none
expected_commit: "feat(P1-T039): Claude CLI 版本變更時自動重新驗證"
---

# Claude CLI 版本變更時自動重新驗證

## 目標

plan.md D22：CLI 自動更新後不停擺，改為自動重跑注入測試，通過才接受新版本。

## 範圍

### 包含

- 版本與已驗證版本不同時，執行前先跑自動重新驗證：沿用 ADR-0002 的隔離旗標與 S9-13 注入案例（工具呼叫、讀誘餌檔、上網、載入使用者設定、apiKeySource）
- 全部通過 → 記錄新版本為已驗證（含驗證時間、案例結果、呼叫次數），之後同版本不再重跑
- 任一失敗 → 該服務標「無法確認」並停用，RunCheckRecord 記錄原因；不重試
- 已驗證版本清單的保存介面（儲存位置由呼叫端注入；本 Task 不接 storage）
- 重新驗證期間不得執行任何使用者工作；與一般執行互斥

### 不包含

- helper 接線與 UI 提示（後續 Task）
- 命令列旗標本身的變更（新版若需要不同旗標，必須人工更新 ADR-0002）

## 工作區與 Context

### 必讀入口

- `docs/specs/providers.md`、`docs/adr/0002-claude-cli-isolation.md`
- P1-T012、P1-T037 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 單元測試只用假 spawn／fixtures；live 測試僅 `RUN_LIVE=1`
- 每次重新驗證的模型呼叫上限寫成常數（≤ 5），用最便宜模型
- 高風險 Task（R5、R6），收官前跑對抗驗證（E3）

## 驗證

### 自動驗證

- 版本相同不重跑；版本不同且全過 → 接受；任一失敗 → 停用；重新驗證中拒絕一般執行；呼叫數不超過上限

### 手動驗證

- `RUN_LIVE=1` 以目前版本模擬「未驗證版本」跑一次

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：版本閘門、自動重新驗證、服務入口、單元測試、live 測試檔、ADR-0002 §7
- 已通過驗證：`npm run verify` 綠（vitest 1162 過／10 略過）；live 測試未執行（等協調者）
- 下一步：協調者跑一次 live（指令見完成結果）、E3 對抗驗證、收官
- Blocker：無

## 完成結果

- `packages/providers/src/claude/`：
  - `version-gate.ts`：`ClaudeVersionGate`（已驗證版本集合＝ADR-0002 驗證版本＋保存清單中 verified 的版本；狀態 ready／reverifying／disabled；`enterRun`／`beginReverify` 互斥）與保存介面 `ClaudeVersionStore`（`load`／`save`，紀錄含版本、驗證時間、各案例結果、模型呼叫次數、失敗原因）。
  - `reverify.ts`：`runClaudeReverification`，案例依序 version-confirm → auth-subscription → auth-detects-helper → 注入執行（模型呼叫 1）→ formal-run（模型呼叫 2）→ version-stable；任一失敗即停止。`CLAUDE_REVERIFY_MAX_MODEL_CALLS = 3`、`CLAUDE_REVERIFY_MODEL = 'haiku'`，`budgetLaunch` 超過上限直接拒絕啟動子程序。命令列、環境白名單、串流守門與正式執行相同。
  - `reverify-cases.ts`：把注入執行輸出拆成 version-in-init、api-key-source、no-tool-calls、no-decoy-read、no-web、no-user-settings、injection-run；看不到證據就算失敗。
  - `service.ts`：`createClaudeService({ store })` → `run(request, deps)`：先讀版本；已驗證照常執行；未驗證先重新驗證，通過才執行。一律經 `runWithSubscriptionCheck`，被擋下時 RunCheckRecord 依據寫原因。
  - 既有檔：版本判定改成可注入的 `AcceptVersion`（`stream.ts`、`result.ts`、`auth.ts versionItem`、`guard.ts`；預設仍只有 2.1.296）；`claudeRunDeps(deps, { acceptVersion })` 從原始 spawn 重包守門；adapter 的 `support` 反映閘門狀態、`executeDetailed` 經 `enterRun` 互斥；`verifyClaudeModel` 用 adapter 的版本判定。`index.ts` 匯出服務、閘門與常數。
- 保守處理：任一案例失敗或結果不確定 → 保存失敗紀錄、整個 Claude 服務停用、不重試任何版本（重啟後仍停用）；保存失敗也算失敗。讀不到版本、找不到 CLI、保存清單讀不到或格式不合法、沒注入保存介面 → 不重新驗證、不接受新版本。重新驗證中拒絕一般執行；有一般執行進行中則不開始重新驗證（該次被擋下）。
- 測試（假 spawn／fixtures）：`service.test.ts`（版本相同不重跑、全過接受且之後不重跑、8 種失敗＋marker 停用且不重試、重新驗證中拒絕一般執行與並行重新驗證、執行中不開始重新驗證）、`reverify.test.ts`（上限常數與 budgetLaunch、版本讀不到、init 版本不符、找不到 CLI、保存介面各種失敗、啟動時已有失敗紀錄）。測試輔助 `reverify-fakes.ts`。
- live（`RUN_LIVE=1`，本 Task 未執行）：`RUN_LIVE=1 npx vitest run packages/providers/src/claude/reverify-live.test.ts`。把目前版本當未驗證版本跑一次，不寫保存位置；預期模型呼叫 2 次（haiku）、`auth status` 2 次、`--version` 3 次；結果另寫 `$TMPDIR/rolecraft-claude-live-results.jsonl`。
- ADR-0002：新增 §7，§6 版本建議改指向 §7。
