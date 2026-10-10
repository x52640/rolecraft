---
id: P1-T005
phase: 1
status: blocked
depends_on: ["P1-T001"]
specs: ["runtime-and-budget.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/work-job/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T005): domain：R9 工作單元狀態機"
---
# domain：R9 工作單元狀態機

## 目標

S9-11：額度用完要停得乾淨、續跑接得上。

## 範圍

### 包含

- WorkJob／WorkUnit 狀態轉換：執行中、完成、丟棄、暫停（額度／取消）
- 續跑只能由使用者觸發（D21），從第一個未完成單元開始
- 取消後才回來的結果丟棄
- 重試策略：額度錯誤不重試；暫時性錯誤最多 2 次、間隔遞增
- 每單元記錄服務與模型；切換只在單元之間

### 不包含

- 持久化（P1-T006）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/runtime-and-budget.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 純函式；時間由呼叫端注入
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-11 每個子句一個測試

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
- Blocker：等待相依：P1-T001

## 完成結果
