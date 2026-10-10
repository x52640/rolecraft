---
id: P1-T040
phase: 1
status: in_progress
depends_on: ["P1-T041", "P1-T027", "P1-T007"]
specs: ["resume-output.md", "evidence-model.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/export/", "apps/helper/src/services/", "packages/contracts/src/entities/resume-version.ts", "apps/helper/src/main.ts", "packages/storage/src/export/pdf-cleanup.ts", "packages/storage/src/export/pdf-cleanup.test.ts", "packages/storage/src/files/", "packages/storage/src/application/storage-sweep.ts", "packages/storage/src/application/storage-sweep.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T040): helper：匯出接線"
---

# helper：匯出接線

## 目標

R3：把 pdf-export 與 storage 接起來，匯出時建立不可變 ExportVersion；並接上啟動時的 sweepStorage 與 Claude 串流守門。

## 範圍

### 包含

- 匯出 handler：domain `checkExportReadiness` → 組 ResumeDocument → `exportResumePdf` → `exports.create()`；R1 結果與 document 必須來自同一份 ResumeVersion（測試鎖住）
- 從 Profile＋ResumeVersion 組 ResumeDocument 的規則；contracts ResumeSection 缺段落歸屬／項目類型時 additive 補欄位
- helper 啟動時呼叫一次 `sweepStorage(db, fileStore)`
- helper 建立 Claude 執行 deps 一律用 `claudeRunDeps`
- PDF 經橋接回傳用 P1-T041 的分塊協定

### 不包含

- UI

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-output.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的完成結果；`docs/RESIDUALS.md` 相關條目

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- R1 未過不得匯出；匯出不等於投遞
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 各項有測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：匯出 handler／服務、ResumeDocument 組裝規則、contracts 段落歸屬欄位、helper 資料區與啟動清掃、Claude deps 入口、測試
- 已通過驗證：worktree `npm run verify` 綠（Vitest 1976 通過、11 略過）；`RUN_CHROME=1` 的匯出接線整合測試本機 Chrome 實跑通過
- 下一步：協調者收官（對抗驗證屬實 2 項已修：清單單筆遺失、啟動清掃寬限期）
- Blocker：無

## 完成結果

- contracts（additive）：`ResumeSection` 加選填 `placement`（段落歸屬：`summary` 自我介紹／`experience` 工作經歷，以公司＋職稱＋起始日期對到 Profile 的一段經歷／`project` 專案）與 `itemKind`（`paragraph`／`bullet`，省略＝一般段落）。
- 組 ResumeDocument（`apps/helper/src/handlers/export/document.ts`）：姓名（`personalInfo.姓名`）、聯絡方式（只印 電話／電子郵件／個人網站／地點，郵件與 http(s) 網址才成連結）、公司｜職稱、任職日期（「至今」）、技能一律取自 Profile；各段原文照印為一個項目；經歷依 Profile 順序，沒有段落的經歷也印標題列；Profile 舊經歷描述不印。R1 跳過的實質空白段落不印（用 `checkExportReadiness` 探測，與 R1 判定一致）。沒有歸屬、經歷對不到、缺姓名 → 不能匯出（`invalid_request`）。
- `export.create`（`export-create.ts`）：履歷版本只讀一次並深度凍結成快照，R1、文件、匯出版本全部用這份；Profile 必須恰好一份且已確認；R1 未過回 `not_ready`、不呼叫匯出器；`exportResumePdf` 帶同一份 R1 結果；匯出版本只存印出的段落、這些段落引用的事實項與片段副本、職缺快照副本；不建立投遞紀錄。字型／Chrome／PDF 檢查／storage 拒絕 → `internal_error`（固定訊息；PDF 阻擋問題列代碼）。
- `export.list_versions`／`get_version`／`read_pdf`：read_pdf 依 P1-T041 分塊協定（512 KiB／塊、最多 128 塊、整份 SHA-256）；超過分塊上限的 PDF 在匯出時就拒絕。
- 服務介面 `ExportService` 方法設為選填：分派表測試以 `pdfExport: {}` 驗「未接上回 not_implemented」，方法未提供時 handler 回 not_implemented。
- helper 資料區（`apps/helper/src/services/runtime.ts`）：環境變數 `ROLECRAFT_DATA_DIR`（資料庫 `rolecraft.sqlite`＋檔案區 `files/`）與 `ROLECRAFT_FONTS_DIR`（隨附字型）由安裝程式寫入包裝檔；都沒設 → 依賴儲存的服務不接（not_implemented）；只設一個、非絕對路徑、資料夾不存在、資料庫打不開或 `sweepStorage` 失敗 → `config_invalid`、結束碼 1。開啟時呼叫一次 `sweepStorage(db, fileStore)`。字型成功後快取、失敗下次重讀。`main.ts` 的 `createServices(runtime)` 接上 `pdfExport`。
- Claude deps（`apps/helper/src/services/claude-deps.ts`）：`helperClaudeDeps` 是 helper 唯一入口（內部 `claudeRunDeps`）；靜態檢查擋 helper 其他檔案直接用 `claudeRunDeps`／`createClaudeStreamGuard`，以及用到 Claude 執行 API 卻沒經 `helperClaudeDeps`。
- 測試：段落歸屬 schema；組裝規則（Profile 欄位、順序、空白段落、對不到經歷、無歸屬、連結）；R1 未過不匯出；**同一份版本**（repo 第二次讀回換過的版本、檢查後改資料庫或改讀出的物件，印出與存下的仍是檢查時那份，且交給匯出器的 R1 結果等於對印出段落重跑的結果）；錯誤對應；分塊拼回與邊界；未設資料區回 not_implemented；sweep 恰呼叫一次、孤兒 PDF 清掉、清掃失敗關資料庫；main 子行程端到端；Chrome 實際匯出（`RUN_CHROME=1` 才跑）。
- 手動驗證：無（真實 104 PDF 與安裝後字型路徑留 P1-T031／P1-T032）。
- 對抗驗證修正：`export.list_versions` 遇單一版本 PDF 遺失或內容與雜湊不符（StorageError）時只略過該筆，其他版本照常列出（不填假大小；contracts 沒有損壞標記）；該版本仍可用 `get_version` 讀內容，`read_pdf` 回 `internal_error`。其他例外照拋。
- 對抗驗證修正（方案 A）：`sweepOrphanPdfs` 加選填寬限期與時間來源，預設 0（`deleteMaterial`、刪投遞紀錄仍立即刪）；`sweepStorage` 加選填 `orphanGrace`，helper 啟動清掃帶 `ORPHAN_PDF_GRACE_MS`（15 分鐘），只刪修改時間早於寬限期的孤兒，避免刪到其他 helper 行程剛寫入、尚未寫資料列的 PDF；啟動清掃補刪的 D19 版本 PDF 不受寬限期影響、立即刪。同內容 PDF 再次存入時 `put` 會更新修改時間（避免重用舊孤兒時被刪）。
- 殘餘：「另一行程刪素材（寬限期 0 的清掃）時撞上本行程正在匯出」的競態仍在（機率極低），需跨行程鎖，另開 Task。
- 殘餘：匯出版本沒有保存 Profile 印出內容（姓名、聯絡方式、公司職稱日期、技能）的結構化快照；PDF 與雜湊有保存。需要 contracts＋storage 變更，在面試教練（第二階段）前另開 Task。
