---
id: P1-T060
phase: 1
status: done
depends_on: ["P1-T058"]
specs: ["bridge.md", "runtime-and-budget.md", "evidence-model.md", "sources-and-authorization.md", "providers.md"]
track: helper
primary_repo: rolecraft
write_paths: ["docs/specs/bridge.md", "packages/contracts/src/bridge/", "packages/contracts/src/index.ts", "apps/helper/src/handlers/analysis/", "apps/helper/src/handlers/sources/", "apps/helper/src/handlers/resume/", "apps/helper/src/handlers/messages/", "apps/helper/src/handlers/claims/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "packages/storage/src/repositories/", "packages/storage/src/index.ts", "packages/storage/src/migrations/", "packages/storage/src/migrate.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/projects/", "apps/editor/src/pages/claims/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
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

- 對抗驗證（2026-10-11）屬實項：
  - 撤銷授權、移除資料夾、檔案被刪後，只靠該來源的事實項要等下次按「分析資料夾」才失效，期間履歷生成與訊息草稿照樣送進模型（R2、R4）→ 撤銷、移除時在同一交易對受影響事實項套 R2 判定（含 revocationHold）並標 `source_documents` 撤銷，不需模型；生成與草稿讀取事實項時再擋一道：引用的來源不是已授權（或已不在授權集合）就當來源已移除（使用者確認過的除外）
  - commitUnit 用啟動時的事實項舊快照整筆覆寫：分析期間使用者否決（刪除）的事實項被復活、確認與修改被蓋掉 → 交易內逐筆重讀現況，已刪除（含 deleted_materials）就略過；存在就以現況為底只套審查狀態升級與矛盾標記；runner 的既有事實項也改用現況
  - （codex）已分析過的文件改成只剩空白：新版本記為已分析，但舊 `document_summaries` 留著，之後的分析一直帶入過期摘要 → 記錄空白版本的同一交易刪除該文件摘要，規劃時也不帶入

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

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：對抗驗證屬實項 2 則＋codex 1 則修正（基準 a941488）
- 已通過驗證：worktree 內 `npm run verify` 綠；協調者對抗驗證（2 個角度）屬實 2 項＋codex 1 項已在 670439e 修正；codex 複審來源關卡效能 1 項由協調者修正
- 下一步：協調者收官
- Blocker：無

## 完成結果

- `analysis.start`：先同步授權集合（重新列舉、只讀已授權且仍在的文件、讀檔留紀錄），`planAnalysis` 依 R2 重新判定既有事實項（撤銷→來源已移除＋保存恢復依據；同 hash 重新授權→恢復），來源文件與判定結果同一交易寫回；再對新增或變更文件建計畫並在背景執行。已在跑回同一工作 id；最近一次尚未跑完就先 `recheck`（R6）通過才以 `resumeJob` 從第一個尚未跑完的單元續跑；暫停期間待跑單元的文件變了則改建新計畫，舊工作標「來源已變更」。
- `commitUnit`：新事實項、`claimUpdates`、工作狀態、計數、該文件摘要與已分析版本同一交易（RESIDUALS P1-T046）；中途失敗整筆回滾、工作改為已暫停（interrupted）。
- 被擋（R6 不通過、供應商不可重試錯誤、計畫過期）與暫停原因寫進資料區，`analysis.status` 重開後仍查得到；重開時執行中的工作由既有 `pauseInterruptedJobs` 改為已暫停，不自動續跑。
- 模型與執行端沿用履歷生成的選定 Claude 模型＋`ClaudeService.run`（R5、R6 每次送出重做）；未選定或不可用回 `no_model`，不讀檔、不呼叫模型。
- 編輯器：專案頁「分析資料夾」按鈕、進度與暫停／被擋原因（暫停或被擋時變「繼續分析」，執行中每 2 秒查一次）；事實項頁看到分析結束就重新讀取。
- 測試：helper 端到端 10 則（暫存資料區＋假資料夾＋假 provider：完成、無模型、R6 被擋、額度暫停→重開→手動續跑、續跑前 R6 不通過、暫停期間文件變更、撤銷與恢復、刪檔、commitUnit 回滾、重複按下），storage 4 則，編輯器 6 則，main 組裝 1 則。
- 範圍外但必要的檔案：`packages/storage/src/migrations/0006_analysis_state.sql`（分析計畫、已分析版本、全域摘要無處可存，續跑與增量判斷需要）、`packages/storage/src/migrate.test.ts`（新 migration 必須更新資料表清單）、`apps/helper/src/bridge/__fixtures__/editor-requests.ts`（dispatch 測試要求涵蓋每個操作）。
- 保守選擇／待裁定：分析出的事實項沒有歸入任何專案（ProjectEvidence 產生來源不在範圍），事實項頁的專案清單仍看不到它們；有資料夾無法列舉就整個不分析（不把暫時讀不到當刪除）；已授權檔讀不到（刪除、變符號連結、過大等）視同刪除，不保存恢復依據；移除資料夾視同撤銷授權；續跑前 R6 用 `providers.recheck`（安裝、登入、版本閘門、R6），通過才續跑；`deleteMaterial` 刪來源文件時不清 `analyzed_documents`／`document_summaries`（摘要只取已授權文件，不影響輸出）。
- 對抗驗證修正：
  - 撤銷授權、移除資料夾在寫入授權狀態的同一交易標 `source_documents` 已撤銷，並對「所有引用來源都已非授權」的事實項套 R2（`evaluateClaimSources`，含撤銷恢復依據），不需模型（`handlers/sources/revocation.ts`）。
  - 生成與草稿讀事實項前先重新列舉資料夾（只列不讀），引用來源不是已授權、已不在授權集合或資料夾列舉失敗就當來源已移除，交給既有可用判定（使用者確認過的仍可用）（`handlers/sources/claim-gate.ts`，resume、messages 經 main.ts 接上）。
  - `commitUnit` 對既有事實項的更新在交易內逐筆重讀現況：已刪除（含 deleted_materials）略過不復活；存在就以現況為底只套複核狀態升級，計數只算實際更新的。
  - （codex）文件改成只剩空白時，同一交易刪除舊摘要，規劃時也不帶入。
  - 回歸測試 6 則（`handlers/analysis/adversarial.test.ts`），修正前除來源關卡外皆失敗（關卡是新元件）。
- 手動驗證需擁有者（自己的資料夾跑一次，併 P1-T032），本次未做。
