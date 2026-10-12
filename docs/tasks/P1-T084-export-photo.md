---
id: P1-T084
phase: 1
status: blocked
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T082 收官後改 ready
- Blocker：相依 P1-T082 未完成

## 完成結果
