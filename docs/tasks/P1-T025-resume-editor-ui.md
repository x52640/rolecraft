---
id: P1-T025
phase: 1
status: blocked
depends_on: ["P1-T024", "P1-T023"]
specs: ["resume-output.md", "evidence-model.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/", "apps/helper/src/handlers/resume/", "packages/contracts/src/bridge/editor/resume.ts", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T025): editor：逐段對照、接受與匯出前檢查"
---
# editor：逐段對照、接受與匯出前檢查

## 目標

F07、R1：使用者逐段把關，檢查不過不能匯出。

## 範圍

### 包含

- 原文與修改稿對照；逐段接受、退回、自行編輯
- 引用編輯規則（只增不刪，刪要整段）
- R1 檢查結果顯示與處理入口（改寫、刪除、去確認事實項、逐段確認）

### 不包含

- PDF 產生

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T024
- 相依 Task 的「完成結果」：P1-T023

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 接受修改稿≠確認事實
- 引用的宣稱完成程度被調低（例如已完成→進行中）時，強制提醒使用者重看該段措辭（P1-T002 對抗驗證：domain 無法判定措辭，R1 交由 F07 把關）
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
- Blocker：等待相依：P1-T024、P1-T023

## 完成結果
