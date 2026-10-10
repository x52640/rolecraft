---
id: P1-T019
phase: 1
status: blocked
depends_on: ["P1-T016", "P1-T014", "P1-T041"]
specs: ["jobs-and-messages.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/jobs/", "apps/helper/src/handlers/jobs/"]
contract_change: none
expected_commit: "feat(P1-T019): editor：職缺快照確認與手動貼上"
---
# editor：職缺快照確認與手動貼上

## 目標

F06、R10：快照可修改、標示來源，手動貼上是正式備援路線。

## 範圍

### 包含

- 快照檢視與修改（記錄被修改）
- 手動貼上職缺文字建立快照（擷取方式＝手動）
- 未擷取到／頁面未提供的標示
- 快照經使用者確認才可用於生成

### 不包含

- LinkedIn 以外的任何自動化

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
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

- 畫面不得把手動標成自動
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
- Blocker：等待相依：P1-T041

## 完成結果
