---
id: P1-T026
phase: 1
status: in_progress
depends_on: ["P0-T001"]
specs: ["resume-output.md", "open-verifications.md"]
track: pdf
primary_repo: rolecraft
write_paths: ["docs/adr/0005-pdf-export.md", "scripts/spikes/pdf/"]
contract_change: none
expected_commit: "docs(P1-T026): 驗證：中文 PDF 匯出方式"
---
# 驗證：中文 PDF 匯出方式

## 目標

D15、S9-10：中文 PDF 要能正常顯示且文字可選取。

## 範圍

### 包含

- 比較 pdf-lib＋fontkit 內嵌字型、Chromium 列印等方式：中文字型授權與大小、可選取文字、分頁控制、安裝負擔（D10）
- 產出樣本 PDF 並自動檢查缺字、可選取

### 不包含

- 正式模板

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- `docs/specs/open-verifications.md`
- 相依 Task 的「完成結果」：P0-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 字型授權需可隨安裝包散布
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- spike 腳本產出樣本

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：spike 腳本、11 種組合實測、ADR-0005，待協調者收官
- 已通過驗證：`node scripts/spikes/pdf/run.mjs` 可重跑；`npm run verify` 綠
- 下一步：協調者合併、稽核、標 done；擁有者確認 ADR-0005 的瀏覽器依賴代價
- Blocker：無

## 完成結果

- 建議：HTML＋CSS 模板交給已安裝的 Chrome 列印（puppeteer-core），字型附 Noto Sans TC 靜態 TTF 400／700（OFL），匯出前用 HarfBuzz（subset-font）依文字裁字型。實測 94 KB、段落 37/37、碼位錯誤 0、423 ms。詳見 `docs/adr/0005-pdf-export.md`。
- pdf-lib＋fontkit 各種組合都不可用：字形畫錯或碼位錯（文字擷取全對也可能畫錯，需人眼看 PNG）。
- Chromium 不先裁字型時會把「小」等字寫成康熙部首碼位（27 字），裁字型後消失；CFF／可變字重字型會變 Type3。
- 缺字時 Chromium 改用系統字型（PingFang、AppleColorEmoji）進 PDF，P1-T027 要擋。
- Arc 用 puppeteer-core 啟動逾時；Edge 未安裝未測。
- 新增 devDependencies：pdf-lib、@pdf-lib/fontkit、pdfjs-dist、puppeteer-core、subset-font（只供 spike；正式依賴由 P1-T027 決定）。
- 字型與樣本不進 repo，腳本執行時下載／產出到暫存區。
