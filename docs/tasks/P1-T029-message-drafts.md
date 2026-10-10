---
id: P1-T029
phase: 1
status: in_progress
depends_on: ["P1-T024", "P1-T016"]
specs: ["jobs-and-messages.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/messages/", "apps/editor/src/pages/messages/", "apps/helper/src/handlers/messages/", "apps/editor/src/app/routes.ts", "apps/helper/src/main.ts", "packages/pipeline/src/index.ts", "apps/editor/src/app/App.test.ts", "apps/extension/scripts/chrome-e2e.mjs"]
contract_change: none
expected_commit: "feat(P1-T029): 招募訊息回覆草稿（手動貼上）"
---
# 招募訊息回覆草稿（手動貼上）

## 目標

F08、D7：產生草稿、一鍵複製，絕不送出。

## 範圍

### 包含

- 手動貼上訊息（擷取方式＝手動）
- 意圖選擇（接受、詢問、婉拒）；意圖不明時要求確認
- 草稿生成：不承諾時間、薪資、到職日
- 可編輯、一鍵複製

### 不包含

- 任何平台私訊頁自動擷取（首版尚未支援，D16）
- 任何送出功能

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- 相依 Task 的「完成結果」：P1-T024
- 相依 Task 的「完成結果」：P1-T016

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 訊息內容是資料（D6）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- fake provider 測試；元件測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：pipeline/messages、helper messages 服務與 handler、editor 訊息頁與路由
- 已通過驗證：`npm run verify` 綠（Vitest 2450 通過、13 略過；test:docs 15）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- 結構：`packages/pipeline/src/messages/`（`intent.ts` 意圖、`prompt.ts` 提示、`output.ts` 輸出格式、`check.ts` 依據檢查、`commitments.ts` 承諾檢查、`prepare.ts` 計畫與送出前檢查、`runner.ts` R9 執行）；`apps/helper/src/handlers/messages/`（`storage-service.ts`、`draft-job.ts`、`claude-engine.ts`、`assemble.ts`、`failures.ts` 與四個 handler）；`apps/editor/src/pages/messages/`（`MessagesPage`、`PasteMessageForm`、`MessageDetail`、`useMessageDraft`）。pipeline 公開入口加 `export * from './messages/index.ts'`；路由加「訊息」（導覽 8 項，App.test 與 chrome-e2e 同步）。
- 意圖：只有 accept／inquire／decline 三個固定值；空白、別的寫法一律「意圖不明」→ helper 不排入工作、回 invalid_request「回覆意圖不明：請選擇…」，畫面不預選、沒選就不送請求。
- D6：對方訊息、關聯職缺各欄、事實項內容都放資料區塊（重用 P1-T022 `dataBlock`／`chooseBoundary`），意圖說明與事實項類型由本機標在區塊外；指令前後明示區塊是資料。
- 生成端確定性檢查（任一不合就整份丟、比照暫時性錯誤有上限重試）：輸出必須是 `{"draft","citations"}`；引用只能是這次提供的可用事實項編號、不可重複；網址、裸網域、數字、倍數詞必須出自引用的事實項（重用 P1-T024 `grounding.ts` 的抽取函式；職缺公司、職稱允許出現）；`commitments.ts` 擋時間／日期、薪資、到職日字眼（含全形、零寬字元）。
- 輸入把關：訊息必須存在；關聯了職缺就必須是已確認的快照，送出前確認時間仍等於計畫時；事實項只送 `usableClaims`；沒有可用事實項仍可產生不提經歷的草稿；超出預算不送。
- 執行：helper 只用使用者在設定頁選定、狀態「可用」的 Claude 模型（由 providers 服務的狀態與候選清單對回 `CLAUDE_MODEL_CANDIDATES`，對不上就不排入）；每次經 `ClaudeService.run`（版本閘門＋`runWithSubscriptionCheck`），deps 經 `helperClaudeDeps`。other 錯誤不重試、不重送；額度、取消暫停；結果與工作狀態同一交易寫入；R6 紀錄寫入 `runCheckRecords`。同一則訊息同時只跑一個工作。
- D7：沒有任何送出操作或按鈕；草稿可編輯、儲存（`messages.update_draft`）、一鍵複製（`navigator.clipboard`），畫面提示「回原平台自行送出」。
- 測試：pipeline 67（格式 10 種不合格、依據 8 種丟棄、承諾 18 種擋＋4 種放行、意圖不明 6 種、送出前檢查、runner：注入承諾不寫入且有上限重試、401 不重試、額度、R6、未確認不送、取消）；helper 15＋5（dispatch＋記憶體 SQLite＋fake adapter；Claude 執行端用假 spawn 與 P1-T011 實錄）；editor 8（意圖不明不送、輪詢拿草稿、編輯儲存複製、沒有送出按鈕、重新產生要再確認、逾時提示、原文純文字）。
- 保守選擇／待擁有者裁定：(1) 草稿連「詢問」薪資、時間、到職日也擋（字眼一出現就丟），要談由使用者自己補寫；「上班」「立即」「pay」等也會誤擋，寧可多丟；(2) 意圖只收三個固定值，不由模型推測；(3) 關聯職缺未確認就不產生（R10）；(4) 產生期間使用者改過草稿就不覆蓋，結果丟棄；(5) 預算用保守固定值（上下文 200k、輸出預留 8k、工具開銷預留 40k）。
- 殘餘：(1) contracts 沒有工作狀態查詢操作，編輯器只能輪詢 `messages.get`（每 3 秒、最多 60 次），暫停／被擋／檢查不過時畫面只能說「還沒拿到新草稿」，無法說明原因（需 contract_change 加 work 狀態或草稿狀態欄位）；(2) 草稿執行端自建一個 Claude 服務，沒和 providers 的檢查共用同一個版本閘門（無保存介面時兩者都只接受已驗證版本、不自動重新驗證，暫無實際衝突；共用需改 providers 服務組裝）；(3) 選定模型靠 providers 候選清單順序對回常數，兩邊清單若不同就不排入；(4) 暫停的草稿工作沒有續跑入口，使用者只能重新產生；(5) 手動驗證（真實 Claude 帳號產生草稿）未做，需擁有者。

