---
id: P1-T004
phase: 1
status: blocked
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T001

## 完成結果
