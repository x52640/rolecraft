---
id: P1-T014
phase: 1
status: in_progress
depends_on: ["P1-T013", "P1-T006"]
specs: ["bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/"]
contract_change: none
expected_commit: "feat(P1-T014): helper：橋接端點與操作清單分派"
---
# helper：橋接端點與操作清單分派

## 目標

R7：本機只開放固定操作，內容永遠是資料。

## 範圍

### 包含

- 依 ADR-0003 實作傳輸層
- 操作分派表：只接受 contracts 中列舉的操作，逐一驗 schema，未知操作拒絕
- 每個操作一個 handler 檔；handler 透過介面呼叫 storage／sources／pipeline
- 啟動、關閉、錯誤日誌（不記錄履歷全文）

### 不包含

- 各 handler 的業務邏輯細節（由對應 Task 補）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/bridge.md`
- `docs/specs/architecture.md`
- 相依 Task 的「完成結果」：P1-T013
- 相依 Task 的「完成結果」：P1-T006

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不得有任何把請求內容傳給 shell、檔案路徑或 CLI 參數的程式路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 分派測試：未知操作、多餘欄位、超大訊息都被拒

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
