---
id: P1-T020
phase: 1
status: in_progress
depends_on: ["P1-T009", "P1-T016", "P1-T014", "P1-T041"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/", "apps/helper/src/handlers/import/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T020): editor：履歷 PDF 匯入與校正"
---
# editor：履歷 PDF 匯入與校正

## 目標

F02、R10：解析結果要使用者確認才可用。

## 範圍

### 包含

- 選擇 PDF → helper 解析 → 預覽原文與欄位草稿 → 逐欄校正 → 確認寫入 Profile
- 解析失敗時清楚提示並提供手動輸入（D18）

### 不包含

- OCR

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`
- 相依 Task 的「完成結果」：P1-T009
- 相依 Task 的「完成結果」：P1-T016
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 未確認的 Profile 不得被 pipeline 使用
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

### 手動驗證

- 擁有者提供 104 匯出 PDF，驗證文字層與解析品質（D18 前提）

## 完成定義

- [x] 「包含」各項完成（真實選取器與 main.ts 接線除外，見完成結果）
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：helper import 服務與四個 handler、editor 匯入頁（選檔、預覽、逐欄校正、暫存、確認、解析失敗改手動輸入）
- 已通過驗證：`npm run verify` 綠（Vitest 90 檔 1889 通過、10 略過；本 Task 新增 31 個測試）
- 下一步：協調者收官；真實選取器與資料庫接線見完成結果「待接線」
- Blocker：真實接線需另開 Task（見完成結果）；手動驗證需擁有者：提供一份 104 匯出的履歷 PDF

## 完成結果

- helper（`apps/helper/src/handlers/import/`）：`service.ts` 定介面（方法可省略，未接上的方法 handler 回 `not_implemented`）；`import-service.ts` 的 `createResumeImportService({ picker, profiles })`：picker 注入（只回檔名＋內容，不經手路徑）→ `extractResumePdf` 本機解析 → `to-result.ts` 轉 contracts `ImportResult`。解析器內部例外也記為 `invalid_pdf`，使用者仍可手動輸入（D18）。匯入結果只在記憶體（最多 20 筆，超過丟最舊），PDF 內容解析完即丟；同時只開一個選取視窗（第二個回 `invalid_request`）。
- 寫入規則（R10）：`save_corrections` 只暫存、不寫 Profile；`confirm` 只寫請求帶的內容並設 `pdfParseConfirmed: true`，同一筆匯入再確認覆寫同一份 Profile；內容全空拒絕；未配發的 importId 回固定文字的 `invalid_request`。Profile 只在確認時寫入，所以不會有未確認的 Profile 進資料庫。
- editor（`apps/editor/src/pages/import/`）：`ImportPage.tsx`（流程）、`ParsePreview.tsx`（各頁原文附行號、偵測欄位附頁碼行號、無文字頁提示）、`ProfileForm.tsx`（個人資料／經歷／技能可改可增刪，「至今」勾選）、`form-model.ts`（草稿→表單：以有公司的行為一段經歷，同一行的日期職稱帶入、之後的經歷行當描述，不跨行猜；表單→`ProfileInput` 並逐條列出缺漏）。確認前必須勾「我已逐欄核對」，改任何欄位會取消勾選。解析失敗顯示原因與「請手動輸入」，不顯示預覽。
- 測試 PDF 由測試程式手寫（`__fixtures__/pdf.ts`：Helvetica 英文、CID 中文、只有圖形），走真實 `extractResumePdf`；Profile 寫入用 `:memory:` SQLite 真實 repository。
- 待接線（範圍外，未改）：
  - 真實系統選取器（osascript `choose file of type PDF`）與讀檔需要 `child_process`／`fs`，但 `apps/helper/src/main.test.ts` 的 R7 靜態掃描禁止 helper 正式原始碼出現這些；要放在哪個套件（例如 sources）或如何調整掃描，需另開 Task 決定。
  - 資料庫開啟與資料目錄尚無定案（P1-T040 的 `services/` 同時在做）；因此 `main.ts` 的 `createServices` 未加入 `resumeImport`。
  - `apps/editor/src/app/App.test.ts` 要求每頁有含「尚未實作」的 note；匯入頁保留一則真實的說明（掃描檔文字辨識尚未實作），各頁實作後該斷言應改寫。`apps/helper/src/handlers/registry.test.ts` 用 `resumeImport: {}` 斷言 not_implemented，仍成立（方法可省略的原因之一）。
- 待裁定：多份 Profile 時生成用哪一份（目前每筆匯入確認後各自一份）；匯入暫存只在記憶體，helper 重啟後未確認的校正會消失。
- 未做：手動驗證（擁有者的 104 PDF 文字層與解析品質，D18 前提）。
