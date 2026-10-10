---
id: P1-T043
phase: 1
status: in_progress
depends_on: ["P1-T020", "P1-T021", "P1-T028", "P1-T040"]
specs: ["sources-and-authorization.md", "bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/sources/src/picker/", "packages/sources/src/index.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/handlers/sources/", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/applications/", "apps/helper/src/handlers/registry.test.ts"]
contract_change: none
expected_commit: "feat(P1-T043): helper：macOS 原生選取器與服務組裝"
---

# helper：macOS 原生選取器與服務組裝

## 目標

P1-T020、T021 的選檔／選資料夾目前只有注入的假選取器，因為 helper 正式原始碼禁止子程序與檔案系統（R7 靜態掃描）；P1-T020、T028 的服務也尚未接進 `createServices`。本 Task 補上真實選取器並把已實作的服務接上，讓編輯器各頁在設定資料區後實際可用。

## 範圍

### 包含

- 在 `packages/sources/src/picker/` 實作 macOS 原生選取器（ADR-0003）：資料夾（可複選）與單一 PDF 檔；AppleScript 內容寫死、`execFile` 不經 shell、不帶任何請求內容；使用者取消回空結果；只回絕對路徑給 helper（不出 helper）
- 選取器對 PDF 只回檔名與內容（大小上限），讀檔也在 sources 套件內完成，helper 原始碼仍不碰檔案系統
- helper `createServices` 接上：sources（真實資料夾選取器）、resumeImport（真實 PDF 選取器）、applications（storage）
- `registry.test.ts` 中各群組的空服務改為反映現況（已實作的群組不再假設回 not_implemented）

### 不包含

- 授權集合、匯入暫存的持久化（另開 Task）
- Windows／Linux 選取器（D11）
- 資料區預設位置（安裝程式 P1-T031 決定）

## 工作區與 Context

### 必讀入口

- `docs/specs/sources-and-authorization.md`、`docs/specs/bridge.md`、`docs/specs/architecture.md`
- `docs/adr/0003-bridge-transport.md`；`scripts/spikes/bridge/host/folder-picker.mjs`（P1-T013 實測過的做法）
- P1-T020、T021、T028、T040 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R7 檔案授權），收官前跑對抗驗證
- 單元測試不得真的開對話框（注入假 execFile）；真實對話框測試只在 `RUN_PICKER=1` 時跑
- helper 的 R7 靜態掃描維持不放寬
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 選取器命令固定、不經 shell；取消、非資料夾、非 PDF、超過大小上限都有測試
- `createServices` 在有 runtime 時接上 sources、resumeImport、applications

### 手動驗證

- 擁有者在真實擴充功能頁選資料夾與 PDF 各一次（需擁有者）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等相依完成後開工
- Blocker：無

## 完成結果
