---
id: P1-T004
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["runtime-and-budget.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/budget/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T004): domain：R8 輸入預算與拆批"
---
# domain：R8 輸入預算與拆批

## 目標

S9-6：任何一次送出都不能超過預算。

## 範圍

### 包含

- 預算公式（上限－輸出預留－工具開銷預留）
- 保守的 token 估算器（中英混合；寧可高估）
- 把來源片段清單拆成不超預算的批次，保留來源位置
- 單一片段過大時再分段

### 不包含

- 取得各模型上下文上限（providers）

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

- 估算器要文件化高估係數；不得宣稱等於官方計量
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 邊界測試：剛好等於、超過一個 token、單片段超過預算

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：預算公式、估算器、分段、拆批與測試
- 已通過驗證：`npm run verify` 綠（domain 新增 18 測試）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- `packages/domain/src/budget/`：`formula.ts`（`computeInputBudget` 上限－輸出預留－工具開銷預留，非整數／負數／扣完不剩回失敗；`fitsBudget` 剛好等於算在內）、`estimate.ts`（保守估算器）、`segment.ts`（`splitByTokens` 單片段再分段，優先換行→句末標點→空白，不切代理對）、`batches.ts`（`planBatches` 依序裝箱，每批記錄估算值、所用預算、來源 id 與 [start,end) 位置）。`index.ts` 只加一行 `export *`。
- 高估係數（檔頭文件化，非官方計量）：ASCII 每 3 字元 1 token（進位）；UTF-8 2／3／4 位元組碼位分別 1／2／3 token（中文每字 2）。每片段另加包裝預留 16 token。估算對串接次可加，所以逐片段加總不會低估整批。
- 暫行（spec 未定）：來源位置用 UTF-16 code unit 半開區間；固定內容（指令、全域摘要、歷史）以字串傳入、每批都計入；空片段略過；失敗原因 `fixed_exceeds_budget`／`budget_too_small`。
