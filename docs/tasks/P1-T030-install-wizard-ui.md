---
id: P1-T030
phase: 1
status: blocked
depends_on: ["P1-T012", "P1-T016", "P1-T014"]
specs: ["providers.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/settings/", "apps/helper/src/handlers/providers/"]
contract_change: none
expected_commit: "feat(P1-T030): editor：供應商狀態與設定精靈"
---
# editor：供應商狀態與設定精靈

## 目標

S9-1、S9-3：分清工具缺少、未登入、資格未知、可用、額度不足。

## 範圍

### 包含

- 三家狀態卡；Codex、Antigravity 首版顯示「尚未支援」
- 官方登入引導（開官方登入流程，不代為輸入）
- 模型選擇
- 清楚標示資料會送到所選供應商

### 不包含

- 安裝包（P1-T031）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T012
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

- 已安裝／已登入不顯示為可用，除非 R5、R6 通過
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

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
- Blocker：等待相依：P1-T012、P1-T016、P1-T014

## 完成結果
