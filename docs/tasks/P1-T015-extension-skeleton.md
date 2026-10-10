---
id: P1-T015
phase: 1
status: in_progress
depends_on: ["P1-T013", "P1-T001"]
specs: ["jobs-and-messages.md", "bridge.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/"]
contract_change: none
expected_commit: "feat(P1-T015): extension：MV3 骨架與橋接客戶端"
---
# extension：MV3 骨架與橋接客戶端

## 目標

擴充功能是職缺擷取的入口。

## 範圍

### 包含

- MV3 manifest、背景 service worker、Vite 打包
- 橋接客戶端（contracts schema）
- 工具列動作：開啟編輯器分頁
- 逐站 content script 的註冊架構（每站一個資料夾，104 先佔位）

### 不包含

- 任何站的擷取邏輯

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- `docs/specs/bridge.md`
- 相依 Task 的「完成結果」：P1-T013
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 權限最小化：只在使用者觸發時注入（activeTab／scripting），不宣告全站 host 權限
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 打包成功；manifest 單元檢查

### 手動驗證

- Chrome 載入未封裝擴充功能，按鈕能開編輯器

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：MV3 骨架、橋接客戶端、轉送與發送者驗證、104 佔位 content script、Vite 打包、Chrome 自動實測
- 已通過驗證：`npm run verify` 綠（Vitest 19 檔 134 測試，extension 50）；`npm run build` 成功；`chrome-e2e.mjs` PASS（Chrome 拋棄式 profile）
- 下一步：協調者收官；擁有者手動驗證工具列按鈕與擷取快捷鍵（步驟見完成結果）
- Blocker：無

## 完成結果

- 打包：`npm run build -w @rolecraft/extension`（根 `npm run build` 也會跑）→ `apps/extension/dist/unpacked/`（Chrome「載入未封裝項目」選它）。`scripts/build.mjs` 用 Vite 分兩段：service worker＋編輯器頁（ES module），每站 content script 各一個 IIFE；manifest 由 `src/manifest.ts` 產生。
- manifest：權限只有 `activeTab`、`scripting`、`nativeMessaging`；無 host 權限、無宣告式 content script、無 `externally_connectable`／`web_accessible_resources`。工具列按鈕開編輯器佔位頁（`editor/index.html`）；快捷鍵 `capture-page`（Alt+Shift+J）觸發時才依註冊表注入該站 content script，不支援的頁面只在按鈕上提示。
- 橋接（ADR-0003）：只有 service worker 持有 Native Messaging 連線（`src/bridge/client.ts`）；送出前用 `BridgeRequest` 驗、回覆用 `BRIDGE_SCHEMAS[op].response` 驗，不合法回 `BridgeFailure`、不丟例外。頁面經 `chrome.runtime.sendMessage({ channel, request })` 轉送（`src/relay/`），service worker 驗發送者：必須本擴充功能；擴充功能頁可用全部操作；content script 只能在主框架、已註冊職缺頁、送該站平台的自動擷取。
- 逐站架構：`src/sites/registry.ts`（中繼資料）＋`src/sites/<platform>/{adapter,content}.ts`；104 佔位，`capture` 一律回 null（不送任何東西）。
- 自動實測：`node apps/extension/scripts/chrome-e2e.mjs`（先 build）→ Chrome 拋棄式 profile＋假 host，7 項全過：service worker 啟動、編輯器頁載入、合法往返、多帶 `path` 與未知操作不送出、host 回不合法回應被擋、host 只收到合法請求。不在 `npm run verify`。
- 手動驗證（擁有者，Chrome）：1）`npm run build`；2）`chrome://extensions` 開發人員模式 →「載入未封裝項目」選 `apps/extension/dist/unpacked`；3）點工具列 RoleCraft 按鈕 → 開出「RoleCraft 編輯器」佔位頁；4）在任一非 104 頁按 Alt+Shift+J → 按鈕出現「!」與提示；5）在 104 職缺頁按 Alt+Shift+J → 該頁 console 出現「104 自動擷取尚未支援」。
- 待裁定／後續：
  - 橋接 schema 沒有請求 id，客戶端只能一次一則依序往返；要並行需 contracts 加 id（contract_change）。
  - host 名稱暫定 `com.rolecraft.helper`（`src/bridge/host.ts`），helper（P1-T014）註冊時要一致；放 contracts 較好。
  - 錯誤代碼只有 `invalid_request`／`internal_error`，「helper 未安裝／未啟動」「逾時」暫歸 `internal_error`；編輯器要分辨就要加代碼。
  - extension ID 未固定（manifest 無 `key`），host manifest 的 `allowed_origins` 要靠 P1-T031 處理。
  - 註冊表只有職缺頁路徑；訊息頁（`submit_message_capture`）路徑等逐站驗證時再加。
