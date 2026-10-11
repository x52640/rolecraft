---
id: P1-T045
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md", "sources-and-authorization.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/extension/src/bridge/client.ts", "apps/extension/src/bridge/client.test.ts", "apps/extension/src/bridge/host.ts", "packages/contracts/src/bridge/", "packages/sources/src/picker/osascript.ts", "packages/sources/src/picker/folder-picker.test.ts", "packages/sources/src/picker/pdf-picker.test.ts"]
contract_change: additive
expected_commit: "fix(P1-T045): 橋接：選取器操作的逾時配合原生對話框"
---

# 橋接：選取器操作的逾時配合原生對話框

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T020／T021／T043：擴充功能橋接一律 30 秒逾時，但原生選檔視窗最多開 5 分鐘；使用者超過 30 秒才選好，結果被丟掉、helper 留下沒人拿的匯入。`import.pick_pdf`、`sources.pick_folders` 改用較長逾時（對話框上限＋解析餘裕），其他操作維持 30 秒。常數放 contracts（擴充功能不可依賴 sources），osascript 的對話框上限跟著它

### 不包含

- 已被後續修正解決、已知殘餘或需擁有者裁定的項目（見 docs/CURRENT_TASK.md）

## 工作區與 Context

### 必讀入口

- 範圍內各項提到的原 Task 檔完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（R7），收官前跑對抗驗證；contracts 只加常數（contract_change: additive）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：選取器操作改用較長逾時，contracts 加常數，osascript 對話框上限改取自 contracts
- 已通過驗證：`npm run verify`；新回歸測試在舊 client.ts 上 8 項失敗、修正後全過
- 下一步：協調者照 E3 跑對抗驗證後收官
- Blocker：無

## 完成結果

- contracts（`packages/contracts/src/bridge/protocol.ts`，只新增）：`PICKER_DIALOG_TIMEOUT_MS`（5 分鐘）、`BRIDGE_PICKER_OPERATIONS`（`import.pick_pdf`、`sources.pick_folders`）、`BRIDGE_PICKER_TIMEOUT_MS`（對話框上限＋60 秒讀檔／解析餘裕＝6 分鐘）。放在已被 index 轉出的檔案，沒有改 index。
- 擴充功能 `client.ts`：每個請求依操作決定逾時，選取器操作用 `BRIDGE_PICKER_TIMEOUT_MS`（可用 `pickerTimeoutMs` 注入），其他操作維持 `DEFAULT_TIMEOUT_MS` 30 秒；逾時訊息顯示該請求實際的毫秒數。排隊、名額、晚到回覆丟棄的行為不變。
- sources `osascript.ts`：`DIALOG_TIMEOUT_MS` 改為取自 contracts 的 `PICKER_DIALOG_TIMEOUT_MS`（architecture.md 允許 sources 依賴 contracts），兩邊不會各改各的。
- 回歸測試：`client.test.ts` 新增 8 項（兩個選取器操作 31 秒仍在等、接近對話框上限才回覆照樣收到、超過選取器逾時仍回 timeout；一般操作仍 30 秒逾時且不受在途選取器影響；覆寫注入）；`folder-picker.test.ts` 新增 1 項確認 osascript 逾時等於 contracts 常數且小於橋接選取器逾時。
- 殘餘：`docs/specs/bridge.md` 尚未寫明選取器操作的較長逾時（不在本 Task write_paths），建議後續補一句。

