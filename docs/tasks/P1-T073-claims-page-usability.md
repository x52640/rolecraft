---
id: P1-T073
phase: 1
status: in_progress
depends_on: ["P1-T063"]
specs: ["evidence-model.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/claims/", "apps/helper/src/handlers/claims/", "packages/contracts/src/bridge/editor/claims.ts", "docs/adr/0006-contracts-interim-fields.md", "docs/specs/bridge.md"]
contract_change: additive
expected_commit: "feat(P1-T073): 事實項來源顯示檔名、可一次確認多項"
---

# 事實項頁實用性

## 目標

協調者實測（2026-10-12）：分析一個 5 份文件的資料夾就產生 27 項事實項。來源顯示成「文件 6dfa176b-…」（UUID），看不出是哪個檔；確認要每項選狀態再按一次，27 項很累。

## 範圍

### 包含

- 來源顯示檔名（與資料夾名稱），不顯示內部 ID；回應相加檔名欄位
- 批次確認改良：每項可勾選，上方「把勾選的設為：已完成／計畫中 並確認」一次完成；仍只收狀態正常的項目（待確認、來源未矛盾、來源未撤銷），其他項目不能勾並說明原因；確認前顯示將確認的數量
- 「全選本專案可批次的項目」
- 保留逐項確認
- 測試：檔名顯示；批次設定狀態並確認；不可批次的項目被排除

### 不包含

- 改事實項規則（R1、完成程度規則不變）

## 工作區與 Context

### 必讀入口

- `docs/specs/evidence-model.md`、`bridge.md`（claims 段）
- `apps/editor/src/pages/claims/`、`apps/helper/src/handlers/claims/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 協調者例外允許改 contracts（相加）
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 實跑
