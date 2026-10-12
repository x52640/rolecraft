---
id: P1-T080
phase: 1
status: in_progress
depends_on: ["P1-T078", "P1-T079"]
specs: ["resume-import.md", "providers.md", "bridge.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/import/"]
contract_change: none
expected_commit: "feat(P1-T080): helper：網頁來源 AI 整理接線（姓名四來源、未辨識不送）"
---

# helper：網頁來源的 AI 整理接線

## 目標

把 P1-T078 的網頁區塊整理接到 `import.ai_parse`／`import.ai_status`：組出已知姓名與既有 Profile 的遮蔽值，本次頁面姓名沒辨識出、又沒帶使用者確認的姓名時不呼叫模型。

## 範圍

### 包含

- 網頁來源的 AI 輸入：姓名元素文字（`cleanHeaderName`）、標籤為姓名的區塊值、資料區既有 Profile 的姓名與聯絡值、請求帶來的使用者確認姓名（可多個寫法）
- 送出條件不成立 → `import.ai_parse` 回固定原因（讓編輯器請使用者確認姓名），不呼叫模型
- 執行走既有 Claude 路徑（選定模型、R5／R6 每次重做、R6 紀錄照存），背景執行、同一筆不重送；網址、照片不進提示
- `import.ai_status` 回網頁來源草稿（區塊出處、還原個資旗標、512 KiB 上限失敗）

- 協調者附註（2026-10-12）：P1-T078 回報：`cleanHeaderName(nameText)` 會切掉「中文名 英文名 標語」的英文名，接線時要把 `headerNameAlias` 的結果一起放進姓名來源 (1) 陣列，否則只出現在頁首的英文名不會被遮。

- 協調者附註 2（2026-10-12）：pipeline 新增拒絕原因 `name_parts_over_limit`（姓／名組合超過上限，fail closed），接線時對應 `import.ai_parse` 失敗 `invalid_request`，訊息「姓名欄位過多，請改用手動輸入」；不可對應成 name_required（確認姓名也解不開）。

### 不包含

- 編輯器按鈕與姓名輸入（P1-T081）
- PDF 路徑行為變更

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「網頁來源的 AI 整理」
- `docs/specs/providers.md` R5、R6
- P1-T078、P1-T079 完成結果；`apps/helper/src/handlers/import/ai-runner.ts`、`ai-source.ts`、`assemble.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資不送模型、計費：只在使用者按下且姓名已辨識時呼叫）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 假 provider：送出的提示不含姓名（四種來源各一案例）、聯絡值、網址；只有舊 Profile 姓名時回「需確認姓名」且模型呼叫 0 次；帶使用者確認姓名後才送
- R6 不通過不送；同一筆執行中不重送；PDF 路徑既有測試照舊

### 手動驗證

- 協調者以開發入口（P1-T068）用合成網頁擷取實跑一次（便宜模型、一次呼叫）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：網頁來源 AI 整理接線＋測試（worker 一個 commit）
- 已通過驗證：`npm run verify` 綠（Vitest 4137 通過、21 略過）
- 下一步：協調者收官（對抗驗證 E3、codex review、開發入口手動實跑一次）
- Blocker：無

## 完成結果

- 接線：`import.ai_parse` 收 `names`（使用者確認姓名）；網頁來源在按下當下組 `WebResumeParseInputs`（`ai-web-source.ts`）：(1) `cleanHeaderName(nameText)`＋`headerNameAlias(nameText)`（附註 1）、(2) 由 pipeline 從區塊找、(3)／聯絡值＝資料區全部 Profile 的個人資料（姓名類標籤→姓名，其餘 `isPersonalLabel`→聯絡值）、(4) 請求 `names`。網址不放進輸入；送模型的只有 `prepareWebResumeParse` 的提示。
- 執行：`ai-jobs.ts` 把 PDF／網頁兩種來源的準備與執行收成同一介面，`ai-runner.ts` 沿用既有選模型、R5／R6 每次重做、R6 紀錄、背景執行、執行中不重送；網頁狀態帶 `source: 'web'`、草稿放 `webDraft`。
- 拒絕對應：`name_unconfirmed`→`invalid_request`＋`reason: name_required`；`name_parts_over_limit`→`invalid_request`（無 reason，訊息「姓名欄位過多，請改用手動輸入」，附註 2）；`no_text`、`over_budget`、`no_service` 照舊；都不呼叫模型。
- 測試：`web-ai-parse.test.ts`（四個姓名來源各一、只有舊 Profile→name_required 且模型 0 次、確認後才送、單字姓名不算確認、姓名欄位過多、擷取與查詢不呼叫、沒有模型、R6 不通過不送、執行中與同時兩次只送一次、格式錯、還原個資標示）；`web-ai-parse-104.test.ts` 端到端（104 履歷頁結構經 submit_resume_capture→ai_parse→ai_status，假 provider 記錄提示，斷言無姓名、英文名、電話、email、地址、網址）。P1-T077 的 expected-blocks.json 尚未在 main，區塊仿 fixture 與 pipeline 104 測試。
- 保守選擇：Profile 姓名欄位用本地寬鬆比對（含「姓名」「名字」「name」等就當姓名，多遮不漏）；多份 Profile 時全部的姓名與聯絡值都遮；PDF 路徑忽略 `names`。
- 殘餘（需協調者／擁有者看）：
  1. 規格送出條件把「姓名標籤的值」算辨識：頁面只有「英文姓名：Ivy」、姓名元素沒找到（nameText 為 null）時會送出，沒有標籤的頁首中文名會進提示（測試已記錄此行為）。104 有登記姓名元素時不受影響；要堵需改規格（例如只有英文名標籤不算）或 pipeline。
  2. nameText 是純英文（沒有中文名開頭）時 `cleanHeaderName` 不切，整串含標語當一個姓名遮；單獨出現的英文名（不接中文名）不會被遮。
  3. `unknownImport` 訊息仍是「請重新選擇 PDF」（網頁來源也用）；未改。
