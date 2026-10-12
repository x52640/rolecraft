---
id: P1-T070
phase: 1
status: in_progress
depends_on: ["P1-T062"]
specs: ["providers.md", "bridge.md"]
track: providers
primary_repo: rolecraft
write_paths: ["docs/specs/providers.md", "packages/providers/src/claude/", "apps/helper/src/handlers/providers/", "apps/editor/src/pages/settings/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/handlers/analysis/failures.ts", "apps/helper/src/handlers/resume/failure.ts", "apps/helper/src/handlers/intro/failures.ts", "apps/helper/src/handlers/messages/"]
contract_change: none
expected_commit: "fix(P1-T070): helper 重開後不必手動重新檢查，使用者發起 AI 工作時自動做連線檢查"
---

# helper 重開後 Claude 狀態歸零

## 目標

協調者實測（2026-10-12）：helper 每次重開（實際使用＝每次開 Chrome），Claude 狀態變回「資格未知」，所有 AI 工作（分析、履歷、自介）回「尚未選定可用的模型」，要使用者自己去設定頁按「重新檢查」才恢復；模型選擇其實有存。

## 範圍

### 包含

- 使用者發起需要 Claude 的工作時，若本次 helper 尚未做過連線檢查，先自動做一次（R5：登入方式、方案、隔離；不呼叫模型），通過就繼續原工作，不通過回明確原因
- 設定頁打開時若尚未檢查，也自動檢查一次（同樣不呼叫模型）
- 不在 helper 啟動、背景輪詢時呼叫模型（D24 不變）；版本閘門規則不變
- 測試：重開後直接發起生成 → 自動檢查一次再執行；檢查不通過 → 不執行並回原因；設定頁開啟觸發一次；都不呼叫模型（假 runner 計次）

- 協調者裁定（2026-10-12，worker 回報後）：
  - `createServices` 讓測試能注入假 probe／runDeps；`main.test.ts` 等經過 `createServices` 的測試一律用假的，不得在 verify 時執行真實 `claude`（含 `--version`、`auth status`）
  - 狀態查詢與設定頁自動檢查不呼叫模型；版本未記錄或未完成時，照 D24：使用者發起需要 Claude 的工作時才自動重跑驗證
  - 檢查不通過時，生成端回具體原因（未登入、方案不符、CLI 版本待驗證等），不再一律回「尚未選定可用的模型」

- 審查屬實待修（2026-10-12 對抗驗證＋codex，協調者寫入）：
  1. 並行檢查依「開始順序」丟結果：先開始的檢查較晚結束時，連已通過的結果也被丟掉。改成不丟掉通過的結果（或以較新的狀態為準但不讓通過的結果白做）。
  2. 完整檢查（`prepareRun`）失敗後，本程序不再檢查：之後使用者發起的工作應能再檢查一次（出錯不算檢查過；停用版本仍不重試，D24）。
  3. 重新驗證在請求回應前同步跑，可能超過橋接 30 秒逾時：要讓請求不因重新驗證逾時而失敗（例如回「檢查中」讓前端輪詢、或延長該請求的逾時），保守做法自選並記錄。
  4. 未選模型時仍先做會呼叫模型的重新驗證：沒有選定模型就不要跑 D22／D24 重新驗證（先回「尚未選定模型」）。
  - 每項補測試（假 runner 計次）。

- 修正 cde0ddb 的審查待修（2026-10-12 對抗審查＋codex，協調者寫入）：
  1. 手動「重新檢查」（`providers.recheck`）正在重新驗證時發起工作：`prepareRun` 不等手動那次，另開一般檢查被閘門擋下，回「請到設定頁按重新檢查」。改成共用進行中的檢查，或閘門為 reverifying 時回「檢查中」（`CLAUDE_CHECKING_REASON`）。
  2. `quota_exhausted` 被當成 settled、不再檢查（R9），但訊息叫使用者「等額度恢復後再試」，照做永遠不會成功。保守改法：訊息改成「額度恢復後請到設定頁按「重新檢查」」，R9 行為不變。
  3. （codex）`check-scheduler.ts` 的 rescue 條件太寬：較新的檢查同時有確定的登入／訂閱路線失敗（例如登出）時，仍會採用較舊的通過結果，狀態被蓋成 available。只在「純版本問題」時採用舊結果，較新的確定登入／計費路線失敗一律保留。
  - 每項補測試（假 runner 計次）。


- 改模型驗證規則、R6

## 工作區與 Context

### 必讀入口

- `docs/specs/providers.md`（R5、R6、P1-T058、P1-T062 段）
- `apps/helper/src/handlers/providers/`、`packages/providers/src/claude/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R5 計費路線），收官前跑對抗驗證
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 重開後直接產生自介

## 完成定義

- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：「審查屬實待修」4 項（並行檢查結果、失敗後重試、等待上限、未選模型不檢查），每項補假 runner 計次測試
- 已通過驗證：worktree `npm run verify` 綠（Vitest 3526 通過、13 略過）
- 下一步：協調者稽核、對抗驗證＋codex review；手動以 harness 重開後直接產生自介
- Blocker：無
- 第 3 項（重新驗證可能超過橋接 30 秒逾時）的選擇：helper 端給 `prepareRun` 加等待上限（`CLAUDE_PREPARE_RUN_WAIT_MS` 20 秒），等不到就回既有的失敗碼（no_model／no_service）加具體原因「正在檢查…請稍後再試」，檢查在背景繼續、下次發起接著等同一次。理由：改動最小，不動 contracts、bridge 規格與 extension 逾時；延長單一請求逾時要改 extension／contracts（超出 write_paths），回「檢查中」狀態讓前端輪詢要新增回應欄位（contract 變更）。代價：使用者第一次要再按一次。

## 完成結果

- `ClaudeService.observeVersion`：只讀版本、不重新驗證（0 次模型呼叫）；probe 的 `check({ reverify: false })` 改用它。
- `providers/check-scheduler.ts` 有兩條路：
  - 自動檢查：本程序第一次讀狀態或選定模型前做，只讀版本與登入，並行請求共用同一次，出錯不算檢查過。
  - `prepareRun`：使用者發起的工作走這條。本程序還沒檢查過，或上次只做了自動檢查且結果不可用，就做一般檢查，D22／D24 照常自動重新驗證；停用的版本不重試。
  - 先開始的檢查比較晚結束時，結果丟棄。
- `ProvidersService.prepareRun`（選填）：`messages/claude-engine.ts` 解析模型前呼叫。解析不到模型時，記下具體原因（`providers/unavailable-reason.ts`，由狀態欄位組成、不含路徑）。analysis、resume 的 `no_model` 和 intro、messages 的 `no_service` 失敗訊息都帶這個原因。
- `createServices` 新增第 4 個參數 `providerOptions`，只給測試用。`main.test.ts` 全部改用假 probe，並補上斷言：重開後第一次查狀態自動檢查一次、分析失敗回具體原因、不呼叫模型。
- 設定頁不需要另送請求：開頁讀狀態時由 helper 自動檢查，載入文字改成「讀取並檢查服務狀態中…」。
- 測試：`providers/auto-check.test.ts`（重開後直接生成、未登入、D24 新版本／未完成會重跑、停用版本不重試、設定頁並行讀取共用一次、檢查出錯下次再試、選定前也自動檢查）；`claude/observe-version.test.ts`；SettingsPage 1 案；既有 providers 測試依新行為更新。
- 殘餘：
  - 具體原因靠模組層的「最近一次解析結果」傳給失敗訊息，前提是 helper 單一程序、單一使用者。
  - 履歷匯入的 AI 整理（`import/`，P1-T069）的 `no_service` 文字沒有接具體原因，不在範圍內。

### 審查屬實項修正（2026-10-12）

1. 並行檢查丟結果：`providers/check-scheduler.ts` 的 `refresh` 加 `rescues`。晚到的較舊結果原本一律丟棄；改成它是一般檢查且通過、而最近套用的那次找得到 CLI 卻確認不了版本（`isolation` 不是 passed，例如重新驗證進行中被閘門擋）時採用。較舊結果沒通過照舊丟棄。另外 `ensureChecked` 在一般檢查進行中不另開自動檢查。
2. 失敗後重試：`prepareRun` 改成「目前狀態不是 available／quota_exhausted 就做一般檢查」（原本一般檢查做過一次就不再做）。停用版本的一般檢查只重讀版本與登入，不重新驗證（D24）；額度用完不重新檢查（R9）。
3. 逾時：`prepareRun(waitMs)` 最多等 `CLAUDE_PREPARE_RUN_WAIT_MS`（20 秒），回 false 時 `ProvidersService.prepareRun` 回 `{ status, checking: true }`（新型別 `PrepareRunResult`，`providers/service.ts`，helper 內部介面）；`messages/claude-engine.ts` 記下 `CLAUDE_CHECKING_REASON` 回 null。測試可用 `ProvidersServiceOptions.prepareRunWaitMs` 調短。
4. 未選模型：`ProvidersService.prepareRun` 在 Claude 沒有 `selectedCandidateId` 時不呼叫排程；`claude-engine.ts` 先判斷未選定，回 `CLAUDE_NO_MODEL_REASON`。`main.test.ts` 分析案例改為期望「尚未選定模型」。
- 測試：`providers/check-scheduler.test.ts`（較舊通過採用／較舊失敗丟棄、沒通過後下次再檢查、超過上限回檢查中且不重開檢查、未選模型 0 次一般檢查，全部假 probe 計次、verifyModel 0 次）；`providers/auto-check.test.ts` 新增「停用版本再次發起會重新檢查但 0 次模型呼叫」「未選模型新版本不重新驗證」（假 spawn 計次）。
- `docs/specs/providers.md` P1-T070 段同步。
- 殘餘：一般檢查背景進行中、且本程序還沒做過任何檢查時，設定頁讀狀態看到的是初始「資格未知」（不顯示「檢查中」）；要顯示需新增狀態欄位或沿用 versionCheck=running 的語意，沒做。手動「重新檢查」（`providers.recheck`）本身會同步重新驗證、可能超過 30 秒，是 P1-T062 以來的既有行為，不在這 4 項內。

