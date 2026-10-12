# 開發用網頁測試入口（harness）

> P1-T068。**只供開發者在自己的 Mac 上自測**，不是產品功能，也不是安裝流程的一部分。

## 用途

瀏覽器自動化工具操作不了 `chrome-extension://` 頁面與 macOS 系統選取器。harness 讓編輯器跑在一般分頁
`http://127.0.0.1:<port>/`，經本機伺服器接到同一份 helper（`apps/helper/src/main.ts` 的 `main()`），
選取器改回傳啟動參數指定的路徑。正式擴充功能、service worker、安裝腳本行為不變。

## 啟動

```bash
npm run dev:harness -- --pdf <履歷.pdf> --folders <資料夾1>,<資料夾2> [--port 5317] [--data-dir <資料夾>]
```

- 啟動時先打包編輯器到 `local-samples/harness-web/`，再開伺服器；終端機會印出網址：
  `http://127.0.0.1:<port>/?token=<64 個十六進位字元>`。直接開這個網址；頁面路由照常用 `#/import`、`#/settings` 等接在後面。
- token 每次啟動隨機產生；重啟 harness 後舊網址失效。改了編輯器程式要重啟 harness 才會重新打包。
- `--pdf`：「選擇履歷 PDF」回傳這個檔（照樣經過 PDF 檔頭、大小等檢查）；不給就等同按取消。
- `--folders`：逗號分隔；「加入資料夾」一次回傳全部；不給就等同按取消。
- 相對路徑以執行指令時的目錄為基準；檔案或資料夾不存在就不啟動。
- 資料區預設 `local-samples/harness-data/`（已 gitignore，與正式／dev:install 的資料區分開）。
- 字型唯讀使用 `~/Library/Application Support/RoleCraft-dev/fonts`（`npm run dev:install` 準備的）；沒有就只有 PDF 匯出會失敗。
- Ctrl+C 結束，helper 子程序一併結束。

## 運作方式

| 元件 | 檔案 | 說明 |
|---|---|---|
| CLI 與組裝 | `scripts/dev/harness.mjs` | 打包、開伺服器、用擴充功能同一份橋接客戶端（`apps/extension/src/bridge/client.ts`）連 helper |
| HTTP 伺服器 | `scripts/dev/harness-server.mjs` | 頁面與 `POST /bridge`；轉送走 service worker 同一段 `isRelayMessage → handleRelay` |
| 連線 | `scripts/dev/harness-port.mjs` | 用子程序模擬 `connectNative`：一條連線一個 helper、Native Messaging framing |
| helper 入口 | `scripts/dev/harness-helper.mjs` | 呼叫 `main({ pickers })`，選取器回傳預設路徑 |
| 編輯器通道 | `apps/editor/src/bridge/transport.ts` | 擴充功能頁一律用 `chrome.runtime`；不是擴充功能頁且頁面有 `<meta name="rolecraft-harness">` 才改用 HTTP |

helper 的 origin 是每次啟動隨機產生的假擴充功能 origin，只放進這個 helper 子程序的允許清單。

## 安全限制

- 只綁 `127.0.0.1`；`Host` 必須恰好是 `127.0.0.1:<port>`（擋 DNS rebinding，`localhost` 也拒）。
- 頁面要 `?token=`；`/bridge` 要 `x-rolecraft-harness-token` 標頭、同源 `Origin`、`Sec-Fetch-Site: same-origin`（有帶時）、`application/json`，不回任何 CORS 標頭。
- 請求 schema 與發送者檢查和 service worker 相同（同一段程式），回應再由橋接客戶端依 schema 驗。
- 選取器注入只在 `harness-helper.mjs` 生效：正式入口 `apps/helper/src/main.ts` 直接執行時一律用系統選取器，沒有環境變數或參數能開啟。
- 不寫家目錄。

## 注意

- **會呼叫真實 Claude CLI、消耗訂閱額度**（分析、生成、重新檢查等按鈕）。純讀取頁面（設定頁狀態、清單）不會呼叫模型。
- 同一資料區同時只准一個 helper；不要讓 harness 與瀏覽器擴充功能共用資料區。
