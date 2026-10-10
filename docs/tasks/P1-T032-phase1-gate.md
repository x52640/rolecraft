---
id: P1-T032
phase: 1
status: blocked
depends_on: ["P1-T020", "P1-T021", "P1-T023", "P1-T025", "P1-T028", "P1-T029", "P1-T031"]
specs: ["acceptance.md"]
track: infra
primary_repo: rolecraft
write_paths: ["docs/acceptance/"]
contract_change: none
expected_commit: "docs(P1-T032): 第一階段驗收閘門"
---
# 第一階段驗收閘門

## 目標

逐條跑 S9 1–16，留證據。

## 範圍

### 包含

- 每條驗收對應的自動測試或手動步驟與結果
- 未通過項列入 CURRENT_TASK 已知殘餘或開新 Task

### 不包含

- 新功能

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/acceptance.md`
- 相依 Task 的「完成結果」：P1-T020
- 相依 Task 的「完成結果」：P1-T021
- 相依 Task 的「完成結果」：P1-T023
- 相依 Task 的「完成結果」：P1-T025
- 相依 Task 的「完成結果」：P1-T028
- 相依 Task 的「完成結果」：P1-T029
- 相依 Task 的「完成結果」：P1-T031

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 證據要可重現
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- `npm run verify` 綠

### 手動驗證

- 擁有者實際跑一次「匯入→生成→匯出→投遞紀錄」

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T020、P1-T021、P1-T023、P1-T025、P1-T028、P1-T029、P1-T031；需擁有者：實際跑一次完整流程

## 完成結果
