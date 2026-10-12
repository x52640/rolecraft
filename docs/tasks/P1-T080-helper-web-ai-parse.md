---
id: P1-T080
phase: 1
status: in_progress
depends_on: ["P1-T078", "P1-T079"]
specs: ["resume-import.md", "providers.md", "bridge.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/import/", "packages/pipeline/src/resume-parse/", "docs/specs/resume-import.md"]
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

- 最後完成：「審查待修」6 項已修（第二個 commit，fix）
- 已通過驗證：`npm run verify` 綠（Vitest 4153 通過、21 略過）；重現測試在修正前失敗、修正後通過
- 下一步：協調者收官（修正 diff 複審、開發入口手動實跑一次）
- Blocker：無
- write_paths 擴充（2026-10-12 協調者）：加入 `packages/pipeline/src/resume-parse/`（匯出 `isNameLabel`、網頁區塊用的已知標籤分類、修 redact 比對規則）與 `docs/specs/resume-import.md`（寫回送出條件的保守變更）；理由：審查 1～4 的修法落在 pipeline 與規格，helper 端無法單獨修好。

## 審查待修（2026-10-12 對抗審查＋codex，協調者轉來）

1. 〔協調者保守裁定〕只有英文姓名類標籤（無中文姓名、無可用姓名元素、無確認姓名）不算「已辨識姓名」，回 name_required；規格同步寫明。
2. Profile 姓名欄位判斷改用 pipeline `isNameLabel` 語意（英文名、中文名、暱稱、綽號、本名…）；2 字名字要遮。
3. Profile 個資欄位判斷改用網頁區塊的已知標籤分類（不受 8 字限制）：「緊急聯絡人的通訊地址」的值要遮。
4. 確認姓名／頁面姓名／Profile 姓名產生變體：中文去所有空白、字間空白；英文姓名比對不分大小寫。`林 雨晴`↔`林雨晴`、`ivy lin`↔`Ivy Lin`、`Ivy Lin`↔`IVY LIN`。
5. `nameText` 是純英文且無法可靠拆出姓名（`Alex Smith Great Developer`）時不算已辨識姓名，回 name_required。
6. `ai-runner.ts` `begin`：`select()` 之後重查匯入是否仍在（不在回 unknown_import、不呼叫模型）；`forget` 時中止該筆的 AbortController。
- 不改：作品集網址是否遮蔽待擁有者決定。

## 完成結果

- 接線：`import.ai_parse` 收 `names`（使用者確認姓名）；網頁來源在按下當下組 `WebResumeParseInputs`（`ai-web-source.ts`）：(1) `cleanHeaderName(nameText)`＋`headerNameAlias(nameText)`（附註 1）、(2) 由 pipeline 從區塊找、(3)／聯絡值＝資料區全部 Profile 的個人資料（姓名類標籤→姓名，其餘 `isPersonalLabel`→聯絡值）、(4) 請求 `names`。網址不放進輸入；送模型的只有 `prepareWebResumeParse` 的提示。
- 執行：`ai-jobs.ts` 把 PDF／網頁兩種來源的準備與執行收成同一介面，`ai-runner.ts` 沿用既有選模型、R5／R6 每次重做、R6 紀錄、背景執行、執行中不重送；網頁狀態帶 `source: 'web'`、草稿放 `webDraft`。
- 拒絕對應：`name_unconfirmed`→`invalid_request`＋`reason: name_required`；`name_parts_over_limit`→`invalid_request`（無 reason，訊息「姓名欄位過多，請改用手動輸入」，附註 2）；`no_text`、`over_budget`、`no_service` 照舊；都不呼叫模型。
- 測試：`web-ai-parse.test.ts`（四個姓名來源各一、只有舊 Profile→name_required 且模型 0 次、確認後才送、單字姓名不算確認、姓名欄位過多、擷取與查詢不呼叫、沒有模型、R6 不通過不送、執行中與同時兩次只送一次、格式錯、還原個資標示）；`web-ai-parse-104.test.ts` 端到端（104 履歷頁結構經 submit_resume_capture→ai_parse→ai_status，假 provider 記錄提示，斷言無姓名、英文名、電話、email、地址、網址）。P1-T077 的 expected-blocks.json 尚未在 main，區塊仿 fixture 與 pipeline 104 測試。
- 保守選擇：Profile 姓名欄位用本地寬鬆比對（含「姓名」「名字」「name」等就當姓名，多遮不漏）；多份 Profile 時全部的姓名與聯絡值都遮；PDF 路徑忽略 `names`。
- 殘餘（需協調者／擁有者看）：
  1. （已由審查 1 修）只有英文姓名標籤時中文名漏遮。
  2. （已由審查 5 修）純英文 nameText 整串當姓名；單獨出現、不接中文名的英文名字（例如只有「Alex」）仍不會被遮。
  3. `unknownImport` 訊息仍是「請重新選擇 PDF」（網頁來源也用）；未改。

### 審查 6 項修正（fix commit）

1. 只有別名類標籤不算辨識：pipeline `web-labels.ts` 新增 `isAliasNameLabel`（英文、外文、暱稱、綽號、別名、English、Nickname、Alias、Preferred），`splitWebBlocks` 另回 `recognizedNames`（去掉只來自別名類標籤的值），送出條件只看它；遮蔽照舊用全部姓名值。規格「送出條件」寫明。`web-name-paths` 通則測試裡英文姓名、英文名、暱稱三案改成「未確認回 name_unconfirmed＋確認後仍遮」，沒有刪遮蔽斷言。
2. Profile 姓名欄位：helper 改用 pipeline `isNameLabel`（index 新匯出），另保留含「姓名／名字／name」的寬鬆判斷（只會多遮）；2 字名字照遮。
3. Profile 個資欄位：改用 `isPersonalBlockLabel`（index 新匯出，中文標籤不受 8 字限制）。
4. 姓名變體：`redact.ts` 姓名比對式去掉名單中文字間空白、英文空白可多可少；含英文字母的姓名另加一次不分大小寫、前後不接英文字母的比對（原本分大小寫的比對照舊，只會多遮）；`web-names.ts` 加「中文去空白」寫法，讓「林 雨晴 Ivy Lin」也拆得出英文別名。
5. nameText：切出的姓名要是 2～5 個中文字，或整串是 1～3 個大寫開頭英文字（三個字另加前兩個字）；否則不算辨識，整串放進只遮蔽的姓名（profileNames）。
6. `ai-runner.ts`：選模型期間匯入被清掉就回 unknown_import、不送；每筆執行有自己的 AbortController，`forget` 時中止。
- PDF 路徑影響：只有 `redact.ts` 共用。PDF 的姓名比對因此也多了「不分大小寫（有字界）」與「空白可多可少」，只會多遮、不會少遮；P1-T069 既有測試全過。
- 新測試：`packages/pipeline/src/resume-parse/web-t080-review.test.ts`（1、4）、`apps/helper/src/handlers/import/web-ai-review.test.ts`（2、3、5、6）；`web-ai-parse-104.test.ts` 的「只有英文姓名」案例改成 name_required、確認後全部不進提示。
