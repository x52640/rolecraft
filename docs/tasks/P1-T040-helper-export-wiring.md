---
id: P1-T040
phase: 1
status: in_progress
depends_on: ["P1-T041", "P1-T027", "P1-T007"]
specs: ["resume-output.md", "evidence-model.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/export/", "apps/helper/src/services/", "packages/contracts/src/entities/resume-version.ts", "apps/helper/src/main.ts"]
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
