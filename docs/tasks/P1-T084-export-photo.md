---
id: P1-T084
phase: 1
status: in_progress
depends_on: ["P1-T082"]
specs: ["resume-output.md"]
track: pdf-export
primary_repo: rolecraft
write_paths: ["packages/pdf-export/src/model.ts", "packages/pdf-export/src/model.test.ts", "packages/pdf-export/src/template/", "packages/pdf-export/src/__fixtures__/", "packages/pdf-export/src/export.chrome.test.ts", "apps/helper/src/handlers/export/"]
contract_change: none
expected_commit: "feat(P1-T084): 匯出 PDF 頁首放照片，匯出版本記照片 ID 與雜湊"
---

# 匯出 PDF 加照片

## 目標

匯出時若有目前照片，模板在頁首放照片，匯出版本記照片 ID 與雜湊；沒有照片時版面照常。

## 範圍

### 包含

- pdf-export：`ResumeDocument` 相加選填照片（data URI，CSP 已允許 `img-src data:`）；模板頁首放照片，不遮住文字；沒有照片版面不變
- helper 匯出：讀目前照片帶進文件，建立匯出版本時記照片 ID 與雜湊（P1-T082 的 repository）
- 照片不送模型：確認履歷生成、自介、AI 整理的輸入都不讀照片（測試）

### 不包含

- 照片選取與處理（P1-T083）
- 模板其他外觀調整

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「照片」、R3
- P1-T082 完成結果；`packages/pdf-export/src/model.ts`、`template/html.ts`；`apps/helper/src/handlers/export/export-create.ts`、`document.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review
- 不得改 `packages/pdf-export/src/index.ts`（P1-T083 的 write_paths）；需要時停下回報
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 有照片與沒照片兩種文件都能匯出、`inspect` 檢查照舊通過；匯出版本有照片時記 ID 與雜湊
- Chrome 測試（需環境變數）產出含照版 PDF

### 手動驗證

- 協調者目視確認含照版：照片有印出、沒有遮住文字（`inspect` 不檢查圖片，W17）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 worker 實作完成（pdf-export 頁首照片、helper 匯出帶照片並記照片 ID／雜湊、照片不送模型守門測試）
- 已通過驗證：`npm run verify` 綠（Vitest 4039 通過、15 略過）；`RUN_CHROME=1` 跑 pdf-export 與 helper 匯出測試全過（含照版 1 頁、inspect 無問題）
- 下一步：協調者收官（範圍稽核、目視確認含照版、codex review）
- Blocker：無

## 完成結果

- pdf-export `model.ts`：`ResumeDocument.photo?: TemplatePhoto`（`dataUri`）；`validateDocument` 加 `unsafe_photo`，只收 `data:image/jpeg;base64,` 且開頭為 JPEG SOI（`/9j/`）、標準 base64；新增 `isJpegDataUri`。未改 `index.ts`（`TemplatePhoto` 未從套件入口匯出，helper 用 `ResumeDocument['photo']`）
- `template/html.ts`：`header()`，沒有照片時輸出與原本逐字相同；有照片時 `<header class="with-photo">` 內文字欄＋`<img class="photo" alt="">`（照片排在全部頁首文字之後，PDF 文字順序不變）。`template/style.ts`：flex 並排、不用 position；照片 `flex: none`、寬 26mm、最高 34mm；文字欄 `min-width: 0`＋`overflow-wrap: anywhere`，縮窄換行不會被照片蓋住
- helper `handlers/export/photo.ts`：`readExportPhoto` 讀一次目前照片，自行重算 SHA-256 與存的雜湊比對（不符就不匯出），產出印出用 data URI 與記錄用 `{ photoId, sha256 }`；`export-create.ts`：`ExportCreateDeps.repos` 加 `photos`，文件帶照片、`exports.create` 帶 `photo`（同一份內容）；匯出途中照片被更換／刪除時由 storage 的目前照片比對拒絕，回「無法建立匯出版本」
- 照片不送模型：`export-photo.test.ts` 靜態掃描組模型輸入的程式（helper resume／intro／analysis／import／messages、pipeline、providers、resume-import 非測試原始碼）不得出現 photo
- 測試：`model.test.ts`（合成照片通過、10 種非 JPEG data URI 被擋）、`template.test.ts`（無照版頁首不變、含照版一張圖排在頁首文字後、文字與順序不變、CSS 照片欄固定寬）、`export-photo.test.ts` 7 案例（無照／有照記 ID 與雜湊、刪照片連帶刪含照未投遞版本、匯出途中更換／刪除不建版本、雜湊不符不匯出、不送模型）、兩個 `export.chrome.test.ts` 各加含照版（RUN_CHROME=1：inspect 無問題、1 頁、文字與無照版相同、PDF 內恰一個 DCTDecode 圖、匯出版本記照片）
- 合成照片：`__fixtures__/photo.jpg`（程式畫的 90×120 色塊，已去 APP1～APP15 區段）、`__fixtures__/photo.ts`
- 保守選擇：(1) 只收 JPEG（storage 只存 JPEG）；(2) helper 另外驗雜湊，不只信 storage；(3) 照片放右上、尺寸固定，不做版面選項
- 人眼確認：`RUN_CHROME=1 PHOTO_PDF_OUT=<路徑> npx vitest run packages/pdf-export/src/export.chrome.test.ts -t 含照版` 會寫出含照版 PDF；worker 已轉圖目視一次：照片在右上、沒有蓋到文字，協調者需再確認（W17）
- 殘餘：照片與文字不重疊目前靠 CSS 與目視，`inspect` 沒有圖片／文字重疊檢查；「不送模型」是原始碼靜態掃描，不是執行期攔截
