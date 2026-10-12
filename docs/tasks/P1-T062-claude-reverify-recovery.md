---
id: P1-T062
phase: 1
status: in_progress
depends_on: ["P1-T058"]
specs: ["providers.md", "bridge.md", "architecture.md"]
track: providers
primary_repo: rolecraft
write_paths: ["docs/specs/providers.md", "docs/specs/bridge.md", "packages/providers/src/claude/", "packages/providers/src/index.ts", "packages/contracts/src/bridge/editor/providers.ts", "packages/contracts/src/bridge/operations.ts", "packages/contracts/src/bridge/__fixtures__/editor-requests.ts", "packages/contracts/src/index.ts", "apps/helper/src/handlers/providers/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/settings/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T062): Claude 重新驗證中斷不算失敗、失敗只綁版本、設定頁可重新啟用"
---

# Claude 重新驗證：中斷不算失敗、失敗只綁版本、可手動重新啟用

## 目標

D24 修改 D22 的失敗處理。現況（`packages/providers/src/claude/version-gate.ts`）：呼叫模型前先存一筆「暫定失敗」，中途被打斷就留下失敗；只要有任何一筆失敗，所有版本的 Claude 永久停用，介面沒有恢復方法。

## 範圍

### 包含

- providers.md 先寫規則（引用 D24），再改程式
- 版本閘門：
  - 中斷 ≠ 失敗：暫定紀錄改成可辨識的「未完成」（例如獨立 outcome 或沿用既有 reason 判斷，選一種並寫進規則）。讀到「未完成」的版本 → 不停用，狀態為「需要重新驗證」；下次**使用者發起**需要 Claude 的工作時自動重跑（仍先存暫定紀錄）。不在 helper 啟動、背景輪詢或狀態查詢時自動呼叫模型
  - 失敗只綁版本：停用只在「目前偵測到的 CLI 版本」最新一筆是 failed 時成立；CLI 版本變成沒有失敗紀錄的另一個版本 → 照 D22 自動重新驗證
  - 既有資料相容：P1-T058 已存的紀錄（含 reason = `重新驗證未完成` 的暫定失敗）要依新規則讀成「未完成」，不能讓舊資料繼續永久停用
- 重新啟用：新橋接操作（相加，例如 `providers.reverify_claude`），只在目前版本被停用或未完成時可用；按下就對目前版本重跑注入測試（S9-13，3–5 次極短呼叫），通過才接受；沿用與一般執行互斥、R6、暫定紀錄等既有保護。不提供「不測就放行」的路徑
- 編輯器設定頁：Claude 卡片在停用或需要重新驗證時顯示原因與「重新啟用」按鈕，說明會用掉幾次極短呼叫；執行中按鈕停用並顯示進度；結果出來後更新狀態
- 測試一律用 `reverify-fakes.ts` 等假執行，不呼叫真實 CLI
- 對抗驗證與 codex review（2026-10-12）屬實項：
  - （codex P1）版本 A 失敗後 CLI 換成 B，按「重新檢查」時連線檢查因閘門停用先短路，根本沒讀新版本，一直回 A 的失敗 → 使用者發起的重新檢查要先定位並 observe 目前版本，再做支援判斷
  - （codex P2＋對抗）設定頁的 `versionCheck` 是上次重新檢查的快照：重新啟用結果為 not_needed／blocked、或生成路徑的自動重新驗證停用了版本時都不更新，畫面顯示錯誤狀態或沒有按鈕 → 狀態查詢時從閘門即時算（不呼叫模型），可用性 `state` 也一併同步
  - （對抗）真的失敗但結果寫不進資料區時，最後一筆仍是暫定紀錄，重啟後被讀成「未完成」而自動重跑、用掉模型呼叫 → 寫入失敗時再試一次寫入精簡失敗紀錄；兩次都失敗才退化為「未完成」，此退化寫進 providers.md

### 不包含

- Codex、Antigravity
- 修改注入測試案例本身

## 工作區與 Context

### 必讀入口

- `plan.md` D22、D24
- `docs/specs/providers.md`（R5、R6、P1-T058 段）
- P1-T039、T058 完成結果
- `packages/providers/src/claude/version-gate.ts`、`reverify.ts`、`service.ts`；`apps/helper/src/handlers/providers/claude-probe.ts`、`persistence.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R5、R6 計費路線），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts、分派表（worker 規則 10 對本 Task 不適用）；不改 `handlers/services.ts`、`main.ts`，除非組裝真的需要（需要就在回報說明）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 中斷：存暫定紀錄後模擬程序結束 → 重開 → 狀態「需要重新驗證」、未呼叫模型；使用者發起工作 → 重跑一次
- 失敗綁版本：A 版失敗 → 停用；CLI 換成 B 版 → 自動重新驗證一次；換回 A 版 → 仍停用
- 重新啟用：通過 → 可用；不通過 → 仍停用、紀錄新增一筆；與一般執行互斥；R6 不通過不呼叫模型
- 舊資料：P1-T058 格式的暫定失敗紀錄讀成「未完成」
- 狀態查詢、helper 啟動都不會呼叫模型

### 手動驗證

- 無（live 測試不在本 Task）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：版本閘門改以版本為單位（verified／failed／incomplete）、`providers.reverify_claude` 背景重新啟用、設定頁原因與按鈕、spec 規則
- 已通過驗證：worktree 內 `npm run verify` 綠（3008 個測試：2995 通過、13 略過）；全部用假 spawn，未呼叫真實 CLI
- 下一步：協調者收官（高風險：對抗驗證）
- Blocker：無

## 完成結果

- providers.md 新增 P1-T062 規則（D24）：每個版本以最後一筆為準，分 verified／failed／incomplete。暫定紀錄改用獨立 outcome `incomplete`；P1-T058 舊格式（outcome=failed、reason 為舊暫定原因字串（PROVISIONAL_REASON）、沒有案例）讀成 incomplete。
- 版本閘門（`version-gate.ts`）：記每個版本最後一筆；`observe` 記目前讀到的版本，停用（`disabled`）與「需要重新驗證」（`needs_reverify`）只看目前版本；`statusOf(version)` 給原因。暫定紀錄寫不進去 → 該版本只在記憶體記為失敗、0 次模型呼叫。
- 服務（`service.ts`）：`ensureVersion` 對沒有紀錄或 incomplete 的版本自動重跑（使用者發起的重新檢查、選定模型、生成／分析才會走到），failed 版本直接擋下；新增 `reverify()`：只在目前版本 failed／incomplete 時重跑，其他回 `not_needed`，沿用互斥、暫定紀錄、R6 案例在模型呼叫之前等保護。
- 橋接：新增 `providers.reverify_claude`（payload 空），helper 在背景跑、立即回 `{ started, status }`；`ServiceStatus` 加選填 `versionCheck`（running／failed／incomplete＋原因）與 `lastReverify`（passed／failed／not_needed／blocked＋原因＋時間）。原因先去掉路徑再回（R7）。背景執行理由：重新驗證最長十幾分鐘，擴充功能一般請求逾時 30 秒。
- 編輯器設定頁：Claude 卡片在停用或需要重新驗證時顯示原因、呼叫次數說明（約 2 次、最多 3 次）與「重新啟用」；執行中按鈕停用並每 3 秒重讀狀態，結果出來後顯示上次重新啟用結果。
- 測試：`reverify-recovery.test.ts`（失敗綁版本 A→B→A、舊資料相容、重新啟用通過／不通過／不需要、互斥、R6 不通過 0 次模型呼叫、建立服務與查狀態不啟動程式）、`reverify-strict.test.ts`（中斷→重開需要重新驗證、0 次呼叫；使用者發起工作重跑一次）、helper `reverify-claude.test.ts`（真實檢查路徑＋假 spawn、schema 相符）、編輯器 `SettingsPage.test.ts`。
- 範圍外改動：`packages/contracts/src/bridge/operations.ts`（操作列舉加一項）與 `packages/contracts/src/bridge/__fixtures__/editor-requests.ts`（fixture 加一項）。新增橋接操作一定要改這兩個檔，write_paths 沒列；協調者訊息允許本 Task 改 contracts，兩處都只加一行。
- 保守選擇：重新檢查（使用者按的）遇到 incomplete 或新版本會自動重跑，與 D22 原本行為一致；重新啟用時 R6 不通過也會記一筆 failed（注入測試的 auth-subscription 案例在模型呼叫之前失敗）。
- 手動驗證：無（live 測試不在本 Task）。

