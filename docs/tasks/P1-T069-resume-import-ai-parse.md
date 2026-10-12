---
id: P1-T069
phase: 1
status: in_progress
depends_on: ["P1-T066", "P1-T064"]
specs: ["resume-import.md", "evidence-model.md", "providers.md", "bridge.md", "architecture.md"]
track: resume-import
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/", "packages/pipeline/src/index.ts", "packages/resume-import/src/", "packages/contracts/src/bridge/editor/import.ts", "packages/contracts/src/bridge/operations.ts", "packages/contracts/src/bridge/__fixtures__/editor-requests.ts", "packages/contracts/src/index.ts", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/import/", "apps/editor/src/bridge/", "docs/specs/resume-import.md", "docs/specs/bridge.md", "docs/adr/0006-contracts-interim-fields.md", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T069): 履歷 PDF 用 AI 整理成欄位，逐欄照抄原文檢查，聯絡資料只在本機抽取"
---

# 履歷 PDF 用 AI 整理欄位

## 目標

擁有者 2026-10-12 裁定：履歷解析全部用 AI（額度可接受），不再只靠版面規則。文字層仍在本機讀（不做 OCR）；把讀到的文字交給使用者選定的 Claude 模型整理成經歷、技能等欄位，程式逐欄檢查是否照抄原文，最後仍由使用者逐欄確認（R10）。

## 範圍

### 包含

- 聯絡資料不送模型（協調者保守選擇，記入 CURRENT_TASK）：送出前在本機抽出並移除「標籤：值／標籤⇥值」形式的聯絡類行（手機、電話、E-mail、地址、通訊地址、聯絡方式、LINE 等）與看起來像電話、email 的片段；這些欄位由本機規則直接預填個人資料。姓名也在本機抽（104 規則或頁首大字），不送模型
- pipeline `resume-parse/`：照 analysis／intro 的做法——資料區塊加隨機邊界、文字一律當資料不是指令；每行帶「頁-行」編號；要求模型輸出 JSON：學歷、經歷（公司、職稱、開始、結束、至今、描述）、技能、其他段落（求職條件、自傳等原樣保留標題）；每個欄位必須附來源行編號
- 輸出檢查（不捏造）：每個欄位值去除空白差異後必須是其來源行（可跨連續數行）的子字串；描述可為來源行的原文接合；不符的欄位丟棄並記原因；日期只能來自來源行；整份輸出格式不符 → 失敗不採用，不自動重試
- 執行走既有 Claude 生成路徑（選定模型、`ClaudeService.run`、R5／R6 每次重做、R6 紀錄照存）；未選模型或 Claude 不可用 → 不呼叫，回明確原因
- 橋接（相加）：例如 `import.ai_parse`（背景執行、立即回狀態）與查詢結果的方式（沿用 intro 的輪詢模式）；結果以既有 `structured` 草稿形狀回傳（或相加新欄位），出處保留頁碼行號
- 編輯器匯入頁：選好 PDF 後自動開始 AI 整理，顯示「AI 整理中」與進度；完成後預填表單；失敗或不可用時顯示原因，並用版面規則（P1-T066，104 有效）或通用規則的結果預填作為退路，標明來源；提供「重新用 AI 整理」按鈕（已編輯則先確認覆蓋）
- 測試全用假 provider：合格輸出被採用；捏造值（原文沒有的公司、改寫的職稱、編造日期）被丟棄；聯絡資料不出現在送給模型的提示裡；未選模型不呼叫；格式錯誤失敗；退路預填
- spec `resume-import.md` 寫入：AI 整理流程、照抄檢查、聯絡資料本機處理、退路

### 不包含

- OCR、圖片 PDF
- 刪除 P1-T066 的版面規則（保留作退路）

## 工作區與 Context

### 必讀入口

- `plan.md`（R1、R5、R6、R10 相關決策）
- `docs/specs/resume-import.md`、`evidence-model.md`、`providers.md`（R5、R6）、`bridge.md`（import、intro 段）
- P1-T064、P1-T066 完成結果；`packages/pipeline/src/intro/`、`packages/pipeline/src/prompts/`、`apps/helper/src/handlers/intro/`（照同樣模式）、`apps/helper/src/handlers/import/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1 不捏造、R5／R6 計費路線、個資），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts（相加）、分派表與 fixtures
- 不讀擁有者真實 PDF；測試資料合成且去識別化
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 見「範圍」測試項

### 手動驗證

- 協調者以開發入口（P1-T068）用擁有者 PDF 實跑一次（擁有者已同意自測用量）
