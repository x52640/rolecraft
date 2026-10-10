---
id: P1-T001
phase: 1
status: in_progress
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

- 最後完成：entities 12 個物件、bridge 4 個操作 schema 與測試
- 已通過驗證：`npm run verify` 綠（Vitest 14 檔 78 測試）
- 下一步：協調者收官；spec 待裁定事項見完成結果
- Blocker：無

## 完成結果

- `packages/contracts/src/entities/`：common（Id、Timestamp、Platform、CaptureMethod、Provider、UserConfirmation）、source-document、claim、profile、project-evidence、job-snapshot、resume-version、export-version、application-record、message-draft、provider-connection（含 RunCheckRecord）、work-job（含 WorkUnit）。全部 `z.strictObject`。
- `packages/contracts/src/bridge/`：`BridgeOperation` 封閉列舉（submit_job_capture、submit_message_capture、request_draft、open_editor）、各操作 request／response、`BridgeRequest` 判別聯集、`BRIDGE_SCHEMAS`（鍵以型別綁定 BridgeOperation）。
- 跨欄位規則（schema 層）：Claim 只有功能／交付物有完成狀態；LinkedIn 不得標自動擷取（D8）；WorkJob 已暫停 ⇔ 有暫停原因。
- 測試：每個物件合法樣本通過、多帶欄位被拒、非法狀態值被拒；bridge 每層多帶欄位被拒、未列操作被拒、遞迴掃描鍵名不得含路徑／指令／模型類詞。
- spec 未定、暫行處理（待裁定）：ID／雜湊／日期格式、Claim 片段位置格式、Profile 個人資料欄位、ApplicationRecord 狀態值（自由文字）、回覆意圖（自由文字）、ProviderConnection／RunCheckRecord 狀態與欄位（providers.md 不在必讀，暫用 passed／failed／unknown）、WorkJob running／completed、橋接操作清單（spec 只舉例）與錯誤代碼、ResumeSection 的 origin 欄位與修改理由／接受退回狀態未建。
