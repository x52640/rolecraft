---
id: P1-T022
phase: 1
status: ready
depends_on: ["P1-T002", "P1-T003", "P1-T004", "P1-T005", "P1-T012", "P1-T008"]
specs: ["evidence-model.md", "runtime-and-budget.md", "providers.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/analysis/", "packages/pipeline/src/prompts/", "packages/pipeline/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T022): pipeline：文件分析成事實項"
---
# pipeline：文件分析成事實項

## 目標

F04、F05：把專案文件變成有來源的事實項，分批、可續跑。

## 範圍

### 包含

- 提示組裝：文件內容以資料區塊包裹並明示不是指令（D6）
- 依 R8 拆批、依 R9 單元化執行
- 模型輸出解析為事實項草稿，每項必須帶來源片段位置；沒有來源的丟棄
- 增量：只處理新增或變更文件（套用 R2）
- 全域履歷摘要維護

### 不包含

- UI

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- `docs/specs/runtime-and-budget.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T002
- 相依 Task 的「完成結果」：P1-T003
- 相依 Task 的「完成結果」：P1-T004
- 相依 Task 的「完成結果」：P1-T005
- 相依 Task 的「完成結果」：P1-T012
- 相依 Task 的「完成結果」：P1-T008

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 模型輸出永遠不轉成指令或路徑
- 輸出 schema 驗證失敗視為單元失敗，不半套寫入
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 以 fake provider 測試完整流程、拆批、暫停續跑

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
