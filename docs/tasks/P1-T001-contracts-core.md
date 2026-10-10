---
id: P1-T001
phase: 1
status: blocked
depends_on: ["P0-T001"]
specs: ["architecture.md", "evidence-model.md", "bridge.md", "resume-output.md", "jobs-and-messages.md", "runtime-and-budget.md"]
track: contracts
primary_repo: rolecraft
write_paths: ["packages/contracts/"]
contract_change: additive
expected_commit: "feat(P1-T001): contracts：核心資料物件與橋接 schema"
---
# contracts：核心資料物件與橋接 schema

## 目標

跨端共用的型別只有一個家，後面所有套件都依賴它。

## 範圍

### 包含

- zod schema＋推導型別：Profile、SourceDocument、Claim（含類型、四態、依據、複核狀態）、ProjectEvidence、JobSnapshot（擷取方式、欄位擷取結果）、ResumeVersion、ExportVersion、ApplicationRecord、MessageDraft、ProviderConnection、RunCheckRecord（R6 紀錄）、WorkJob／WorkUnit
- 橋接操作清單（R7）：每個操作一個 request／response schema；操作名稱為封閉列舉；**schema 中不得有任何可被解讀為路徑、CLI 參數或指令的欄位**
- 依檔案拆分：`src/entities/*.ts`、`src/bridge/*.ts`、`src/index.ts`

### 不包含

- 任何邏輯、I/O

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/architecture.md`
- `docs/specs/evidence-model.md`
- `docs/specs/bridge.md`
- `docs/specs/resume-output.md`
- `docs/specs/jobs-and-messages.md`
- `docs/specs/runtime-and-budget.md`
- 相依 Task 的「完成結果」：P0-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 欄位語意以 spec 為準，不自行新增 spec 沒有的狀態值；spec 沒寫清楚的列入回報
- Claim 狀態值用英文代碼，對照 spec 中文名稱寫在註解
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- schema 單元測試：合法樣本通過、非法狀態值被拒、橋接 request 帶多餘欄位被拒（strict）

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
- Blocker：等待相依：P0-T001

## 完成結果
