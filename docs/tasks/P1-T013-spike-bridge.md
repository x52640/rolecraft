---
id: P1-T013
phase: 1
status: in_progress
depends_on: ["P0-T001"]
specs: ["bridge.md", "sources-and-authorization.md", "open-verifications.md"]
track: bridge
primary_repo: rolecraft
write_paths: ["docs/adr/0003-bridge-transport.md", "scripts/spikes/bridge/", "docs/specs/bridge.md", "docs/specs/open-verifications.md"]
contract_change: none
expected_commit: "docs(P1-T013): 驗證：橋接通訊方式（Q3）與資料夾選取機制"
---
# 驗證：橋接通訊方式（Q3）與資料夾選取機制

## 目標

Q3 由協調者決定：選定擴充功能／編輯器與本機輔助程式的通訊方式，以及資料夾由誰選取、誰讀檔。

## 範圍

### 包含

- 比較 Native Messaging 與 localhost HTTP＋token：來源限制、R7、Chrome／Arc／Edge 在 macOS 上的 host manifest 位置
- 資料夾選取：瀏覽器 File System Access（內容由瀏覽器讀、送資料不送路徑）vs 輔助程式原生對話框；對照 R4、R7 與增量更新的持久權限
- 做最小可行原型（echo host）並在 Chrome 實測；Arc、Edge 列手動檢查步驟
- 結論寫 ADR-0003；`bridge.md` 的 Q3 改成指向 ADR 的定案句

### 不包含

- 正式 helper 實作

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/bridge.md`
- `docs/specs/sources-and-authorization.md`
- `docs/specs/open-verifications.md`
- 相依 Task 的「完成結果」：P0-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 原型不得接受任意路徑或指令
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 原型腳本可重跑

### 手動驗證

- 擁有者在 Arc、Edge 載入未封裝擴充功能並跑 echo 測試（見 ADR 步驟）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：原型（echo host＋MV3 擴充功能＋安裝腳本＋Chrome 自動實測）、ADR-0003、bridge.md Q3 指向句、open-verifications 兩項指向 ADR
- 已通過驗證：`npm run verify` 綠；`node --test scripts/spikes/bridge/test/` 11/11；`node scripts/spikes/bridge/chrome-e2e.mjs` PASS（Chrome 155，拋棄式 profile）
- 下一步：協調者收官；擁有者依 ADR-0003「手動驗證步驟」跑 Arc、Edge（與真實 Chrome profile）及原生選取器
- Blocker：Arc／Edge 手動驗證需擁有者（本機未安裝 Edge）

## 完成結果

- 建議：只用 Native Messaging；編輯器做成擴充功能頁；資料夾由輔助程式開 macOS 原生選取器，路徑不出 host（理由、代價、證據等級見 ADR-0003）。
- 原型 `scripts/spikes/bridge/`：`host/`（框編解碼、固定操作 ping／echo／pickFolders、拒絕未知操作與多餘欄位）、`extension/`（MV3，頁面與 service worker 各跑自我測試）、`install.mjs`（預設 dry-run，`--yes` 才寫、`--uninstall` 移除）、`chrome-e2e.mjs`（拋棄式 profile＋CDP `Extensions.loadUnpacked`）、`test/host.test.mjs`（node:test）。
- 實測：Chrome 155 頁面與 service worker 各 4 案全過；不在 `allowed_origins` 的擴充功能被拒（forbidden）。未實測：Arc、Edge、真實 profile 安裝、原生對話框與 TCC 提示。
- 原型測試不在 `npm run verify`（vitest 只收 packages／apps）；要重跑用上面兩條命令。
