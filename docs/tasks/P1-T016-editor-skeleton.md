---
id: P1-T016
phase: 1
status: blocked
depends_on: ["P1-T015"]
specs: ["architecture.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/", "apps/extension/"]
contract_change: none
expected_commit: "feat(P1-T016): editor：React 骨架與路由"
---
# editor：React 骨架與路由

## 目標

編輯器是所有校正與確認的介面。

## 範圍

### 包含

- Vite＋React＋TypeScript；以擴充功能頁面形式提供（或依 ADR-0003）
- 路由骨架：匯入、專案、事實項、職缺、履歷、投遞、設定
- 橋接客戶端 hook
- 元件按頁面分資料夾，單檔 300 行上限

### 不包含

- 各頁面功能

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/architecture.md`
- 相依 Task 的「完成結果」：P1-T015

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- UI 文字繁體中文
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件 smoke 測試（Vitest＋Testing Library）

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
- Blocker：等待相依：P1-T015

## 完成結果
