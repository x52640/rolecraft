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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
