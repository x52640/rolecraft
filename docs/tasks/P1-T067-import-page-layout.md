---
id: P1-T067
phase: 1
status: in_progress
depends_on: ["P1-T020"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/ImportPage.tsx", "apps/editor/src/pages/import/ParsePreview.tsx", "apps/editor/src/pages/import/ProfileForm.tsx", "apps/editor/src/pages/import/ImportPage.test.ts", "apps/editor/src/pages/import/import.css", "apps/editor/src/pages/import/components/"]
contract_change: none
expected_commit: "feat(P1-T067): 匯入頁版面重整：分區卡片、欄位標籤、原文對照"
---

# 匯入頁版面重整

## 目標

擁有者 P1-T032 實測（2026-10-12）：匯入頁沒有樣式，欄位擠成一列、標籤與輸入框黏在一起、描述框只有兩行、原文是一長串清單，「好恐怖」。只改畫面，不改解析邏輯與資料流。

## 範圍

### 包含

- 新增 `import.css`（照其他頁的做法，例如 `jobs.css`、`claims.css`；沿用 `styles.css` 的字型與 `color-scheme: light dark`，深淺色都要可讀）
- 版面：
  - 頁首說明精簡；檔案列與「改選其他檔案」一列
  - 寬螢幕左右兩欄：左邊校正表單、右邊原文（可捲動、依頁分組、行號淡色）；窄螢幕上下排
  - 個人資料：標籤欄＋值欄的兩欄格線，每列一個刪除鈕（小、次要樣式）
  - 每段經歷一張卡片：標題「第 N 段：公司｜職稱」（空就顯示「未填」），公司／職稱／開始／結束各自標籤在上、輸入框在下的格線，「至今」勾選放結束日期旁；描述是全寬、至少 6 行、可拉高的文字框；刪除鈕放卡片右上、次要樣式
  - 技能：標籤（chip）樣式，可刪除單一個、可新增
  - 底部確認列固定在視窗下方（勾選＋確認按鈕），不用捲到底才看得到
  - 主要按鈕與次要按鈕樣式區分；危險動作（刪除）不搶眼但可辨識
- 無障礙：每個輸入框都有對應 `<label>`；鍵盤可操作
- 現有行為（勾選才能確認、離開提示、解析失敗訊息、手動輸入）全部保留；既有測試照過，必要時只改選取方式不改斷言語意

### 不包含

- 解析規則與 `form-model.ts`（P1-T066 在改）
- 其他頁面樣式

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-import.md`
- `apps/editor/src/pages/import/` 全部、`apps/editor/src/styles.css`、一份既有頁面 CSS（`jobs/jobs.css`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不改 `form-model.ts` 的型別與匯出（P1-T066 同時在改；只用既有匯出）
- 不引入新的 UI 套件或外部 CSS
- 遵守 `docs/specs/architecture.md`（單檔 300 行）

## 驗證

### 自動驗證

- 既有匯入頁測試全過；新增：每個輸入框有 label、確認列在表單存在時渲染

### 手動驗證

- 擁有者看畫面（需擁有者，併 P1-T032）
