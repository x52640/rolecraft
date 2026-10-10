---
id: P1-T027
phase: 1
status: in_progress
depends_on: ["P1-T026", "P1-T007"]
specs: ["resume-output.md"]
track: pdf
primary_repo: rolecraft
write_paths: ["packages/pdf-export/", "apps/helper/src/handlers/export/"]
contract_change: none
expected_commit: "feat(P1-T027): pdf-export：中文模板與匯出檢查"
---
# pdf-export：中文模板與匯出檢查

## 目標

F07、R3：產出可選取文字的中文 PDF 並凍結版本。

## 範圍

### 包含

- 依 ADR-0005 實作 1–2 頁中文模板（D15）
- 匯出前檢查：缺字、截斷、分頁、連結、空白頁
- 匯出時建立不可變 ExportVersion（P1-T007）

### 不包含

- 模板視覺設計細節（先求正確）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- 相依 Task 的「完成結果」：P1-T026
- 相依 Task 的「完成結果」：P1-T007

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- R1 檢查未過不得匯出
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 產出 PDF 的文字擷取回測

### 手動驗證

- 擁有者看一次樣本 PDF

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：`packages/pdf-export` 模板、Chrome 列印、字型裁切、匯出前／後檢查與公開函式（協調者調整：本輪不接 helper）
- 已通過驗證：`npm run verify` 綠；`RUN_CHROME=1` 整合測試 4 項通過（Chrome 155）
- 下一步：helper handler 呼叫 `exportResumePdf` 並建立 ExportVersion（另開 Task，見完成結果「介面」）；擁有者看樣本 PDF
- Blocker：無

## 完成結果

協調者調整範圍：本輪只做 `packages/pdf-export/`；`apps/helper/src/handlers/export/` 未動（P1-T034 正在改橋接 contract），建立 ExportVersion 留給下一個 Task。write_paths 未改，建議下一個 Task 承接 helper 部分。

- 模板（D15）：`ResumeDocument`（姓名、職稱定位、聯絡資訊、段落 → entry／paragraph／bullet／link）→ HTML＋CSS，A4、1–2 頁。內容全部 HTML 跳脫；CSP 只允許 data: 字型，列印頁面另外中止所有非 data: 請求。連結只允許 https／http／mailto。
- 列印：puppeteer-core 啟動本機 Chrome（headless、puppeteer 暫存 profile）；只列 Google Chrome（Arc／Edge 未驗證＝尚未支援）。
- 字型：Noto Sans TC 靜態 TTF 400／700（OFL 1.1），字型檔不進 repo；`scripts/fetch-fonts.mjs --out <資料夾>` 下載並驗 sha256（已實跑，Google Fonts v40 網址與雜湊仍有效）。`loadBundledFonts(dir)` 載入時再驗雜湊與靜態 TrueType。每次匯出先用 HarfBuzz 依文字裁字型，再以 data: URL 內嵌。測試用 `src/__fixtures__/fonts/` 的子集（約 90 KB×2，附 OFL.txt、NOTICE.txt；`scripts/make-fixture-fonts.mjs` 可重產）。
- 匯出前檢查（不需 Chrome）：結構（空白、控制字元、不安全連結）、缺字（HarfBuzz 讀 cmap，兩個字重都要有）。有問題就不列印。
- 匯出後檢查（pdfjs＋pdf-lib 讀回）：去空白後逐碼位比對原文（擋康熙部首、缺字、截斷、多字）、頁數 ≤ 2、空白頁、連結（缺少／多出）、字型只能是隨附字型且內嵌非 Type3（擋系統字型補字）、標題落頁尾（警告）。截斷不另做座標檢查：pdfjs 會丟掉頁面外的字，必定反映在碼位比對（有測試）。
- 實測發現：CSS `position` 會讓 Chrome 延後繪製、PDF 文字順序錯亂（碼位比對會擋），模板因此不用 position；條列點用背景畫，不印字元。
- 康熙部首回測（`RUN_CHROME=1`）：用未裁切的 fixture 字型（cmap 同時有小／⼩）列印，擷取出部首碼位且被 `text_mismatch` 擋下；走 `exportResumePdf`（先裁切）則 0 問題。系統字型補字回測：繞過缺字檢查放 😀，PDF 出現系統字型被 `foreign_font` 擋下。
- 樣本：虛構履歷 1 頁約 92 KB、約 0.5 秒；重複兩次 2 頁約 119 KB，無警告。重產：`node packages/pdf-export/scripts/render-sample.mjs --fonts <資料夾> --out <資料夾> [--repeat 2]`。
- 依賴：pdf-export 新增 puppeteer-core、subset-font、harfbuzzjs、pdfjs-dist、pdf-lib（root devDependencies 的 spike 用版本未動）。

### 介面（給接 helper 的 Task）

- `exportResumePdf({ r1, document, fonts, browserPath?, timeoutMs? }) → { ok: true, pdf, report } | { ok: false, report }`
  - `r1`：domain `checkExportReadiness` 的結果（結構相容 `{ ok, issues }`）；不是 `ok === true && issues.length === 0` 就丟 `PdfExportError('r1_not_passed')`，先於其他檢查。**helper 必須對組成 `document` 的同一份 sections 跑 R1**，本套件無法驗證兩者對應。
  - `fonts`：`await loadBundledFonts(字型資料夾)`；字型資料夾位置與安裝包打包（含 OFL.txt）由 helper／P1-T031 決定。
  - 前提錯誤丟 `PdfExportError`，code：`r1_not_passed`、`fonts_unavailable`、`browser_not_found`、`browser_failed`、`pdf_unreadable`。
  - `report.issues` 為 `PdfIssue[]`，`isBlocking()` 區分阻擋／警告；`ok: false` 不回傳 PDF。
- `ok: true` 後由 helper 呼叫 storage `exports.create()`（P1-T007）建立 ExportVersion。
- `precheckDocument(document, fonts)`：不啟動 Chrome 的匯出前檢查，可給編輯器即時提示。
- `ResumeDocument` 的組裝（Profile 的公司／職稱／日期＋ResumeVersion 各段 → entry／bullet）由 helper 負責；ResumeSection 目前沒有「屬於哪段／哪種項目」的欄位，組裝規則需先定。
