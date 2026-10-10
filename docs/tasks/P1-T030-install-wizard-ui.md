---
id: P1-T030
phase: 1
status: in_progress
depends_on: ["P1-T012", "P1-T016", "P1-T014", "P1-T041"]
specs: ["providers.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/settings/", "apps/helper/src/handlers/providers/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T030): editor：供應商狀態與設定精靈"
---
# editor：供應商狀態與設定精靈

## 目標

S9-1、S9-3：分清工具缺少、未登入、資格未知、可用、額度不足。

## 範圍

### 包含

- 三家狀態卡；Codex、Antigravity 首版顯示「尚未支援」
- 官方登入引導（開官方登入流程，不代為輸入）
- 模型選擇
- 清楚標示資料會送到所選供應商

### 不包含

- 安裝包（P1-T031）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T012
- 相依 Task 的「完成結果」：P1-T016
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 已安裝／已登入不顯示為可用，除非 R5、R6 通過
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成（登入引導為說明文字，自動開啟官方登入流程見完成結果「待裁定」）
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：helper providers 服務與 5 個 handler、main.ts 接線、編輯器設定頁（狀態卡、模型選擇、資料去向標示、登入說明）
- 已通過驗證：worktree `npm run verify` 綠（Vitest 1901 通過、10 略過；test:docs 15）
- 下一步：協調者稽核；高風險（R5、R6）依 E3 跑對抗驗證
- Blocker：無

## 完成結果

- helper `apps/helper/src/handlers/providers/`：
  - `claude-probe.ts`：Claude 檢查只走 `@rolecraft/providers` 既有路徑。重新檢查＝`checkConnection`（安裝、登入、資格、R6 總結）＋`createClaudeService().ensureVersion`（R5：版本閘門）；模型短驗證＝`ensureVersion` 後 `verifyClaudeModel`（經 R6 確認、強制串流守門，留下 RunCheckRecord）。deps 一律經 `claudeRunDeps(..., { acceptVersion: gate.isAccepted })`。helper 不組命令列、不讀憑證；`process.env` 只交給 core 清理。
  - `state.ts`：狀態判定。找不到 CLI → 工具缺少；版本讀不到、未驗證或服務停用（R5）→ 尚未支援；訂閱登入未通過 → 未登入；R6 明確未通過（例：apiKeyHelper）→ 尚未支援（S8）；R6 或資格無法確認 → 資格未知；短驗證回報額度用完 → 額度不足；全部通過才可用。Codex、Antigravity 固定尚未支援，不檢查、不啟動程式。
  - `providers-service.ts`：狀態、候選對照、選定結果、最近一次 RunCheckRecord 存記憶體。候選 ID 由 helper 隨機配發（`c`＋32 hex，同一程序內穩定），候選別名取 providers 的 `CLAUDE_MODEL_CANDIDATES`；選定只拿 ID 查自己的對照表，查不到（模型名稱、別家 ID、旗標形狀）回 `invalid_request`，錯誤訊息不回填請求內容；短驗證通過才記為選定，失敗保留原選定。
  - `service.ts`：`ProvidersService` 方法皆選填，未接上的方法 handler 回 `not_implemented`（分派表測試 `providers: {}` 照常通過）。
  - `start-login.ts`：一律回 `not_implemented`（見下「待裁定」）。
  - 測試：`providers.test.ts`（狀態判定表、R5／R6 未過不可能可用、初始狀態、Codex／Antigravity 不檢查、候選 ID 不透明且穩定、清單外 ID 一律 invalid_request 且不呼叫驗證、選定與額度不足、未接服務、start_login）；`claude-probe.test.ts`（假 spawn 跑真實檢查路徑：各項通過且子程序環境無 API key、找不到 CLI 不啟動程式、未驗證版本 0 次模型呼叫、apiKeyHelper、未登入、429 額度、init 帶工具、`--model` 只會是別名不是 candidateId）。
- `apps/helper/src/main.ts`：`createServices()` 加 `providers: createProvidersService()`。
- 編輯器 `apps/editor/src/pages/settings/`：`SettingsPage.tsx`（資料去向標示、官方登入說明、三張卡）、`ProviderCard.tsx`（狀態、訂閱登入／方案資格／只走訂閱三項、最近檢查、重新檢查；Codex／Antigravity 只顯示尚未支援、沒有按鈕）、`ModelPicker.tsx`（只在可用時顯示；只能從 helper 列出的候選選，送 helper 配發的 ID；標示驗證會用訂閱做一次極短呼叫）、`labels.ts`。測試 `SettingsPage.test.ts`。
- 保守選擇：
  - 未注入版本保存介面（P1-T039 `ClaudeVersionStore`）：只接受 ADR-0002 驗證版本，CLI 更新後顯示尚未支援、不做自動重新驗證。理由：記憶體保存會讓「失敗後重啟仍停用、不重試」失效，每次 helper 重啟都可能再花模型呼叫。待接 storage 後注入即可啟用 D22。
  - 重新檢查不清掉選定、不呼叫模型；額度不足標記在下一次重新檢查時清除（重新檢查無法得知額度）。
- 待裁定：
  - 官方登入流程：`@rolecraft/providers` 沒有經過 ADR-0002 審查的登入命令，helper 不自行組 CLI 命令列，所以 `providers.start_login` 回 `not_implemented`，編輯器顯示「不代為輸入、不讀憑證」的登入說明，請使用者自行依官方說明登入後按重新檢查。這與 D10（免終端）有落差；要自動開啟需先在 providers 加入並驗證登入命令（另開 Task，改 ADR-0002）。
  - 狀態、選定模型、RunCheckRecord 只在記憶體，helper 重啟即消失；需 storage 接線 Task 保存（S9-2 證據也在此）。
  - Claude 服務實例：本群組自己建一個 `createClaudeService()`；一般執行（P1-T040 等）若另建一個，版本閘門的互斥不跨實例。應由服務組裝共用同一個（`createProvidersService({ service })` 已可注入）。
- 手動驗證：未做（需擁有者真實帳號與瀏覽器）。

