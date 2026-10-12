---
id: P1-T064
phase: 1
status: in_progress
depends_on: ["P1-T060", "P1-T062"]
specs: ["jobs-and-messages.md", "evidence-model.md", "resume-output.md", "bridge.md", "providers.md", "runtime-and-budget.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["docs/specs/jobs-and-messages.md", "docs/specs/bridge.md", "packages/contracts/src/bridge/", "packages/contracts/src/entities/", "packages/contracts/src/index.ts", "packages/pipeline/src/intro/", "packages/pipeline/src/prompts/", "packages/pipeline/src/index.ts", "apps/helper/src/handlers/intro/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "packages/storage/src/repositories/", "packages/storage/src/index.ts", "packages/storage/src/migrations/", "packages/storage/src/migrate.test.ts", "apps/editor/src/pages/jobs/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T064): 針對職缺產生 300 字內投遞自介"
---

# 針對職缺產生 300 字內投遞自介

## 目標

D25：投遞時常要附一段簡短自介。本 Task 讓使用者在職缺頁對某個職缺快照產生 300 字內的投遞自介，可編輯、可複製，不自動送出（D7）。

## 範圍

### 包含

- jobs-and-messages.md 新增「投遞自介」一節（引用 D25），bridge.md 加操作；再改 contracts（只做相加）
- 字數：300 字以內，以 Unicode 字元（code point）計，含標點與空白；超過整份不採用（不截斷）
- 內容規則比照履歷段落：
  - 輸入只有該職缺快照、個人資料欄位、可用的事實項（走既有來源關卡 `handlers/sources/claim-gate.ts`，撤銷或刪除來源的不可用，使用者確認過的除外）
  - 模型要列出引用的事實項與每項寫成的完成程度；沿用履歷生成的 R1 檢查（`packages/pipeline/src/generation/grounding.ts` 等）：引用存在、寫成已完成的必須是使用者確認完成（D14）、數字要出現在引用事實項／個人資料／使用者確認過的文字
  - 沿用訊息草稿的承諾字眼檢查（`packages/pipeline/src/messages/commitments.ts`）：不承諾面試時間、薪資、到職日
  - 檢查不通過：顯示原因，使用者可改寫或重新產生；不提供跳過檢查的路徑
  - 使用者手動編輯後重跑同樣的檢查（數字、承諾字眼）；檢查不通過時「複製」按鈕停用並說明原因
  - 〔2026-10-12 擁有者裁定，D25〕承諾字眼只擋模型產生的內容（產生時含承諾字眼整份不採用，所以存下的文字裡若出現，必定是使用者自己加的）；使用者編輯後的承諾字眼只顯示提示、不停用複製。數字、引用等 R1 檢查照舊會停用複製
  - 職缺快照、個人資料、事實項都是資料不是指令（D6），prompt 隔離寫法比照 analysis prompt
- 執行走 providers 既有的訂閱檢查包裝（R5、R6），用選定模型；未選定或不可用回對應失敗、不呼叫模型。若可能超過橋接逾時，照 `analysis.start`／`analysis.status` 的模式做成背景工作
- 存檔：每個職缺快照保存最近一份自介（文字、引用、產生時間、是否經使用者編輯）；重新產生前若使用者編輯過，編輯器要先確認才覆寫
- 編輯器職缺頁：快照詳情加「產生投遞自介」按鈕、字數顯示、編輯框、複製按鈕；沒有任何可用事實項時提示先分析或確認事實項
- 測試一律用假 provider，不呼叫真實 CLI

### 不包含

- 補充訪談（D26，另案）
- 英文自介、多份版本並存
- 自動貼到求職網站

## 工作區與 Context

### 必讀入口

- `plan.md` D7、D14、D25
- P1-T024、T025、T029、T060 完成結果
- `packages/pipeline/src/generation/`（`grounding.ts`、`runner.ts` 開頭註解）、`packages/pipeline/src/messages/`（`check.ts`、`commitments.ts`）
- `apps/helper/src/handlers/messages/`（同類型的草稿流程，照同樣模式）、`apps/helper/src/handlers/sources/claim-gate.ts`
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1、R5、R6、D7），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts、分派表、`handlers/services.ts`、`main.ts`（worker 規則 10、11 對本 Task 不適用）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；helper 原始碼 R7 靜態掃描不放寬

## 驗證

### 自動驗證

- 假 provider 回合格自介 → 存檔、可取回；回超過 300 字、引用不存在、未確認事實寫成已完成、數字無依據、承諾薪資或到職日 → 不採用並回原因
- 撤銷來源的事實項不進輸入；未選模型不呼叫模型
- 使用者編輯後加入無依據數字 → 複製停用
- 重新產生前已編輯 → 編輯器先確認

### 手動驗證

- 擁有者對一個真實職缺產生一次（需擁有者，併 P1-T032）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：spec（jobs-and-messages「投遞自介」、bridge `intro.*`）、contracts、pipeline `intro/`、storage 0008、helper `handlers/intro/`、編輯器職缺頁投遞自介區塊與測試
- 已通過驗證：worktree 內 `npm run verify` 綠（Vitest 3285 通過、13 略過）
- 下一步：協調者收官；高風險 Task，收官前跑對抗驗證
- Blocker：無（手動驗證需擁有者，併 P1-T032）

## 完成結果

- 橋接新增 `intro` 群組：`intro.generate`（背景產生、立即回狀態）、`intro.get`（自介＋依目前事實項重跑的檢查＋最近一次產生狀態）、`intro.update`（存編輯並重跑檢查）。contracts 新增 `ApplicationIntro`、`IntroProblem`、`INTRO_MAX_CHARS`／`introLength`（code point），只做相加；ADR-0006 加第 13 項。
- pipeline `intro/`：送出前準備（快照已確認、可用事實項、已確認個人資料只送經歷與技能、預算）、提示照 analysis 資料區塊隔離、輸出格式驗證、檢查（字數、引用存在／可用／不重複、完成程度上限沿用 `completionCap`、網址與倍數詞出自引用事實項、數字另可出自已確認個人資料、承諾字眼沿用 `commitmentProblem`、最後過 domain R1 匯出前檢查）。沿用既有匯出，沒有改 generation／messages 的任何檔。
- 執行走 `createClaudeGenerationEngine`（選定模型＋`ClaudeService.run`，R5、R6 每次重做，R6 紀錄照存）；不自動重試。寫入前在同一交易確認快照仍是同一份確認、自介期間沒被使用者改過，否則不覆蓋並回原因。
- storage 0008 `application_intros`（職缺快照 ID 為主鍵、快照刪除連帶刪除）。
- 編輯器職缺頁快照詳情加「產生投遞自介」、字數、編輯框、儲存、複製；有未儲存修改或檢查不通過時停用複製並說明；重新產生前已編輯要再按一次確認；沒有任何送出按鈕。
- 測試全用假 provider：合格存檔可取回；超過 300 字、引用不存在、未確認寫成已完成、數字無依據、承諾薪資／時間／到職不採用並回原因；撤銷來源事實項不進輸入；未選模型、快照未確認、沒有可用事實項不呼叫模型；編輯加入無依據數字複製停用；重新產生前確認。
- 手動驗證（真實職缺產生一次）需擁有者，併 P1-T032。

