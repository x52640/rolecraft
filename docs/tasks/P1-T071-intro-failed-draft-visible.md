---
id: P1-T071
phase: 1
status: in_progress
depends_on: ["P1-T064"]
specs: ["jobs-and-messages.md", "evidence-model.md", "bridge.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["docs/specs/jobs-and-messages.md", "packages/pipeline/src/intro/", "packages/contracts/src/bridge/editor/intro.ts", "packages/contracts/src/entities/", "apps/helper/src/handlers/intro/", "apps/editor/src/pages/jobs/IntroPanel.tsx", "apps/editor/src/pages/jobs/IntroPanel.test.ts", "apps/editor/src/pages/jobs/useIntro.ts", "apps/editor/src/pages/jobs/IntroCitations.tsx", "apps/editor/src/pages/jobs/intro-labels.ts", "apps/editor/src/pages/jobs/jobs.css", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T071): 自介沒通過檢查時保留草稿與問題位置，可修改或請 AI 修正"
---

# 自介沒通過檢查時看不到草稿

## 目標

協調者實測（2026-10-12）：模型產生的自介含沒有出處的數字，整份被丟掉，畫面只顯示「沒有通過檢查」，使用者看不到 AI 寫了什麼、哪裡有問題，只能重按、再耗一次額度。

## 範圍

### 包含

- 沒通過檢查的模型輸出不當成已存自介，但保留為「未通過的草稿」（含檢查問題與問題片段，例如哪個數字沒有出處），顯示在自介區，標明「未通過、不能複製」
- 使用者可直接在草稿上修改並儲存：儲存時照常重跑檢查，通過才成為正式自介（承諾字眼規則照 D25：使用者編輯只提示）
- 「請 AI 修正」按鈕：把檢查問題（例如「數字 12 沒有出處，請刪除或改寫」）回饋給模型重寫一次；使用者按才執行，不自動重試
- 提示加強：明確列出可用數字清單（出自引用事實項與已確認個人資料），要求只能用清單內的數字
- 測試全用假 provider：未通過 → 草稿與問題片段可見、不可複製；修改後通過 → 成正式；請 AI 修正會帶問題回饋；可用數字清單出現在提示

- 審查屬實待修（2026-10-12 對抗驗證，協調者寫入）：
  1. 「請 AI 修正」不擋正式自介框的未存修改，且不確認就覆寫：正式自介有未存修改時，修正要停用或先確認，不得默默丟掉使用者的編輯。
  2. 應徵公司名稱、職稱的數字豁免沒有邊界：名稱如「3M」會讓自介中任何位置的「3M」（例如「3M 營收」）一併豁免。比對要有邊界（前後不是英數字），只豁免名稱本身。
  3. 草稿產生後，已存自介被改過時，「請 AI 修正」仍先呼叫模型才發現衝突、白耗額度：呼叫模型前先比對已存自介，不符就不呼叫並回明確原因。
  - 每項補測試（全用假 provider）。

### 不包含

- 履歷生成的同類問題（另案）

## 工作區與 Context

### 必讀入口

- `docs/specs/jobs-and-messages.md`（D25 段）、`evidence-model.md`（R1）
- P1-T064 完成結果；`packages/pipeline/src/intro/`、`apps/helper/src/handlers/intro/`、`apps/editor/src/pages/jobs/useIntro.ts`（操作 token、請求中鎖定的既有設計要保留）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1），收官前跑對抗驗證
- 協調者例外允許改 contracts（相加）
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 實跑

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首次實作（未通過草稿、儲存草稿、請 AI 修正、可用數字清單）與測試
- 已通過驗證：worktree 內 `npm run verify` 綠（Vitest 3496 通過、13 略過；test:docs 15（rebase 到 f118ffb 後））；全程假 provider
- 下一步：協調者派 worker 修「審查屬實待修」3 項；bridge.md 選填欄位已由協調者補（8ad0ef8）；修完對抗驗證＋codex review
- Blocker：無（手動驗證以 harness 實跑，需協調者）

## 完成結果

- contracts（只相加）：`IntroDraft`（文字、引用、問題、問題片段、時間）與 `INTRO_DRAFT_FRAGMENTS`；`intro.get` 回應選填 `draft`、`intro.generate` 請求選填 `fix`、`intro.update` 請求選填 `draft`。沒有新增橋接操作，分派表與 storage 不動；ADR-0006 第 13 項補記。
- pipeline `intro/`：`runIntro` 在格式合格但檢查不通過時另回草稿（引用編號錯時只留存在、不重複的引用）；`introProblemFragments` 取出沒有出處的網址、數字、倍數詞（去重、限量）；`checkModelIntro`＝檢查＋承諾字眼（模型內容規則）。提示加「可用數字」資料區塊（事實項與使用者確認文字、已確認個人資料送出欄位的數字，按出處分行；不含聯絡資訊欄位），寫作規則改為數字只能照抄清單。`prepareIntro` 可帶回饋：上一版草稿與問題片段放資料區塊、問題說明是固定文字。
- helper `intro/`：草稿只存在記憶體（`drafts.ts`）。儲存草稿照模型內容規則重跑檢查（含承諾字眼），通過才在同一交易寫成自介（快照仍是同一份確認、已存自介仍是草稿產生前那份），沒通過把修改與新問題留在草稿上並回 invalid_request；產生中不能存草稿。`fix` 用草稿與問題重寫一次，寫入比對草稿產生前的已存自介；沒有草稿或快照變了不呼叫模型。重新產生（非修正）先捨棄舊草稿。
- 編輯器：自介區多「未通過檢查的草稿（不能複製）」區塊：問題說明、問題片段清單與原文中標出位置、可編輯的草稿框與字數、「儲存草稿並重新檢查」「請 AI 修正」，沒有複製按鈕。`useIntro` 的操作 token、請求中一律鎖定、單一版本號、StrictMode cleanup 全部沿用：草稿框受同一把鎖與版本號保護；草稿有未存修改時不能修正、重新產生要確認、重新載入要確認；已存自介有未存修改時不能存草稿；複製重檢同步已存自介時不動草稿。`useIntro` 剛好 300 行，輪詢設定與請求種類移到 `intro-labels.ts`。
- 測試（假 provider）：pipeline 草稿、片段、寬鬆引用、可用數字清單（不含電話）、回饋提示隔離；helper 草稿可見不存檔、存草稿通過成正式、仍不通過留草稿、承諾字眼照擋、請 AI 修正帶回饋並成正式、修正仍不過換草稿、無草稿不呼叫模型、已存自介被改不覆蓋、快照變了拒絕、重新產生捨棄草稿、產生中不能存；編輯器草稿可見不可複製與標位置、存草稿成正式、仍不過顯示新位置、修正按鈕停用條件、fix 請求、儲存中鎖定、重新產生確認、StrictMode 只一份；contracts 選填欄位相容。
- 保守選擇：草稿只放記憶體（helper 重開即消失，比照產生狀態）；草稿儲存時承諾字眼照擋（使用者要寫這類字眼須先存成自介再編輯）；格式不合格的輸出不留草稿；問題片段只做出處類（承諾字眼等不標位置）；可用數字清單不列個人資料欄位對照（電話等）的數字，雖然檢查允許。
- 協調者追加（rebase 到 main f118ffb 時）：與 P1-T070 的 `failures.ts` 衝突已解，保留「沒有可用模型」的具體原因（`withUnavailableReason`）與草稿相關訊息。應徵公司名稱與職稱裡的數字：只在快照已確認時，自介中出現的公司名稱、職稱整段文字（正規化後比對，長的先換）不算數字（`withoutJobNames`，檢查第 3 項與最後的 R1 匯出前檢查都套用）；名稱以外的同一個數字仍要有出處。測試：名稱內通過、名稱外的「104」與其他數字不通過、全形數字名稱、快照取消確認後不再適用。
- 手動驗證（harness 實跑）需協調者。
