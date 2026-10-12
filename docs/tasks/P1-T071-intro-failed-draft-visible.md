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
