---
id: P1-T068
phase: 1
status: done
depends_on: ["P1-T059"]
specs: ["bridge.md", "architecture.md"]
track: dev-tooling
primary_repo: rolecraft
write_paths: ["scripts/dev/", "apps/editor/src/bridge/transport.ts", "apps/editor/src/bridge/BridgeProvider.tsx", "apps/editor/src/bridge/bridge.test.ts", "apps/editor/scripts/", "apps/editor/package.json", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "packages/sources/src/picker/", "package.json", "docs/specs/bridge.md", "docs/dev-harness.md", "README.md"]
contract_change: none
expected_commit: "feat(P1-T068): 開發用網頁測試入口：編輯器跑在 localhost、接真的 helper、選取器用預設路徑"
---

# 開發用網頁測試入口（協調者自測用）

## 目標

擁有者 2026-10-12 要協調者自己操作瀏覽器跑完整流程、修到可交付 MVP 再交測。瀏覽器自動化工具無法操作 `chrome-extension://` 頁面，也無法操作 macOS 系統選取器。需要一個**只在開發時使用**的入口：編輯器跑在 `http://127.0.0.1:<port>`，經本機伺服器接到同一份 helper，選取器改回傳預先指定的路徑。正式擴充功能與安裝流程行為不變。

## 範圍

### 包含

- `npm run dev:harness -- --pdf <檔案> --folders <資料夾,...> [--port N]`：
  - 建置（或以 vite）提供編輯器頁面；啟動一個 helper 子程序（沿用 Native Messaging 的 stdio framing 與 origin 檢查，傳入一個 harness 專用 origin 並放進允許清單）
  - HTTP 端點把編輯器的橋接請求轉給 helper、回傳回應；驗證 schema 的地方與擴充功能一致（不能比 service worker 寬鬆）
  - 只綁 127.0.0.1；每次啟動產生隨機 token，頁面帶 token 才接受；檢查 Host header（擋 DNS rebinding）；拒絕跨來源請求
  - 資料區預設 `local-samples/harness-data/`（已 gitignore），字型沿用 `~/Library/Application Support/RoleCraft-dev/fonts`（唯讀使用，不寫家目錄）
  - helper 的 PDF／資料夾選取器改為回傳啟動參數指定的路徑（不跳系統視窗）。注入點只在 harness 啟動的 helper 生效；正式 helper 沒有任何環境變數或參數能開啟此行為
- 編輯器 transport：在 harness 頁面（由 harness 注入的設定判斷）改用 HTTP 轉送；擴充功能頁行為不變
- 文件 `docs/dev-harness.md`：用途、啟動、安全限制（只限本機、只供開發）、會呼叫真實 Claude（額度）
- 測試：token／Host／來源檢查、選取器注入只在 harness 生效、transport 選擇；全程假 helper 或假 provider，不呼叫真實 CLI

- 對抗驗證與 codex review（2026-10-12）屬實項：
  - URL 編碼的 `/%69ndex.html`、`/index%2Ehtml` 繞過頁面 token 檢查，回傳含 token 的頁面 → 授權判斷與送檔用同一份解碼、正規化後的路徑；解碼失敗回 400；測試涵蓋編碼別名
  - 格式錯誤的請求目標（如 `//[`）讓 URL 解析同步丟錯、整個 harness 結束 → 請求檢查包 try/catch 回 400

### 不包含

- 改變正式擴充功能、service worker、安裝腳本行為
- 自動化點擊流程（協調者手動操作）

## 工作區與 Context

### 必讀入口

- `docs/specs/bridge.md`、`docs/specs/architecture.md`
- P1-T059 完成結果（`scripts/dev/install-helper.mjs`）
- `apps/helper/src/main.ts`、`apps/helper/src/bridge/`（framing、origin、host）、`apps/editor/src/bridge/`、`packages/sources/src/picker/`、`apps/extension` 的 service worker 驗證方式

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- helper 原始碼禁止子程序的既有規則不放寬（harness 伺服器在 scripts/dev，可 spawn helper）
- 遵守 architecture.md 相依方向；若 lint 規則擋 scripts/dev 引用 app 原始碼，回報不要改 lint 設定
- 不改家目錄任何設定

## 驗證

### 自動驗證

- 見「範圍」測試項

### 手動驗證

- 協調者以 harness 跑完整流程（會呼叫真實 Claude，擁有者 2026-10-12 已同意自測用量）

## 完成定義

- [x] `npm run dev:harness` 可啟動：編輯器在一般分頁運作、接真的 helper、選取器回傳指定路徑
- [x] token／Host／來源檢查、選取器注入只在 harness 入口生效、transport 選擇有測試（不呼叫真實 CLI）
- [x] `docs/dev-harness.md`、bridge.md、README 已更新
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：審查屬實 2 項已修（編碼路徑繞過頁面 token、錯誤 URL 讓伺服器結束），回歸測試換回舊實作會失敗 4 項
- 已通過驗證：`npm run verify` 綠；實際啟動 harness 以 curl 確認沒 token 403、錯 Host 421、跨來源 403、帶 token 的 `providers.status` 由 helper 回覆；Chrome 分頁開設定頁與匯入頁正常顯示
- 下一步：協調者以 harness 手動跑完整流程
- Blocker：無

## 完成結果

- `npm run dev:harness -- [--pdf <檔>] [--folders <資料夾,...>] [--port N] [--data-dir <資料夾>]`：打包編輯器到 `local-samples/harness-web/`，在 127.0.0.1 開伺服器（預設埠 5317），印出 `http://127.0.0.1:<port>/?token=<隨機 64 hex>`。
- 轉送重用擴充功能程式：`isRelayMessage` → `handleRelay`（發送者視為編輯器頁）→ `createBridgeClient`；連線用子程序模擬 `connectNative`（一條連線一個 helper、同一套 framing），helper origin 是每次隨機的假擴充功能 origin。
- 安全：只綁 127.0.0.1；Host 必須恰好 `127.0.0.1:<port>`；頁面要 `?token=`；`/bridge` 要 token 標頭、同源 Origin、Sec-Fetch-Site same-origin（有帶時）、JSON，不回 CORS 標頭；請求上限 1 MiB。
- 選取器：`apps/helper/src/main.ts` 的 `main()` 新增 `options.pickers` 注入點（正式直接執行時一律 `nativePickers()`，不讀任何環境變數）；`scripts/dev/harness-helper.mjs` 以假 osascript 執行器建立 `createMacFolderPicker`／`createMacPdfPicker`，預設路徑仍經原本的輸出解析與 PDF 讀檔檢查；未指定等同取消。`packages/sources/src/picker/` 不需改動。
- 編輯器：`createDefaultTransport()`：擴充功能頁一律用 `chrome.runtime`；否則頁面有 harness 注入的 `<meta name="rolecraft-harness">` 才用 HTTP（endpoint 只收同源絕對路徑、token 格式檢查）。
- 字型唯讀使用 `~/Library/Application Support/RoleCraft-dev/fonts`；不寫家目錄。
- 改了編輯器程式需重啟 harness 重新打包（token 會換）。
- 審查修正：`resolveTarget` 先解碼再以 posix 規則正規化路徑，授權（`inspectRequest`）與送檔共用這一份；index.html 判斷不分大小寫（macOS 檔案系統不分）；解碼失敗、URL 解析失敗、含 NUL 或反斜線回 400；handler 另包 try/catch，任何檢查例外都回 400，不讓伺服器結束。編碼後的 `/bridge` 也套橋接端點規則。
