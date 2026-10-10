---
id: P1-T026
phase: 1
status: ready
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
