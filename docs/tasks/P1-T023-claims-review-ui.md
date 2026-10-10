---
id: P1-T023
phase: 1
status: in_progress
depends_on: ["P1-T022", "P1-T016"]
specs: ["evidence-model.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/claims/", "apps/helper/src/handlers/claims/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T023): editor：事實項檢視與確認"
---
# editor：事實項檢視與確認

## 目標

D14：使用者逐項確認，確認一次之後所有職缺都能重用。

## 範圍

### 包含

- 依專案列出事實項、狀態、來源片段（可點開原文位置）
- 確認、修改、刪除；批次確認同專案項目
- 待複核／來源已移除／來源矛盾的處理

### 不包含

- 生成

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T022
- 相依 Task 的「完成結果」：P1-T016

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 確認動作記錄時間與當下文字
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
- Blocker：無

## 完成結果
