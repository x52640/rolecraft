---
id: P1-T005
phase: 1
status: in_progress
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

- 最後完成：狀態機、重試策略、測試、contracts PauseReason 定案、ADR-0006 第 7 列
- 已通過驗證：`npm run verify` 綠（domain 12 測試，其中 S9-11 子句 8 個）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- `packages/domain/src/work-job/`：`policy.ts`（重試上限 2、間隔 2s→4s 倍增）、`state.ts`（`WorkRun` ＝ 可持久化 WorkJob＋記憶體中的進行中嘗試、建立／還原）、`transitions.ts`（startUnit、completeUnit、failUnit、cancelJob、resumeJob）。全部純函式；重試時間由呼叫端注入 `now`。
- 取消後晚到結果：每次送出帶呼叫端產生的 `attemptId`，不符目前嘗試的結果／錯誤一律丟棄（含續跑後舊嘗試回來）。
- 暫時性錯誤重試用盡 → 暫停 `retries_exhausted`；輔助程式重開時執行中的工作 → 暫停 `interrupted`；都只能使用者續跑（D21），續跑需 R6 通過旗標。
- 服務／模型記在單元；同一單元重試中不得切換；續跑時清掉第一個未完成單元的紀錄與重試次數，可改用別的服務。
- contracts：`PauseReason` 加 `retries_exhausted`、`interrupted`（additive）；ADR-0006 第 7 列定案。
- 未涵蓋（不屬 domain）：S9-11「無自動加購、付費回退」由 providers（P1-T010）負責；「通過檢查」由呼叫端在 completeUnit 前完成。
