---
id: P1-T020
phase: 1
status: blocked
depends_on: ["P1-T009", "P1-T016", "P1-T014"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/", "apps/helper/src/handlers/import/"]
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T009、P1-T016、P1-T014；需擁有者：提供一份 104 匯出的履歷 PDF

## 完成結果
