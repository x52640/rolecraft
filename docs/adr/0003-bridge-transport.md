# ADR-0003 橋接通訊方式與資料夾選取

- 日期：2026-10-10
- 狀態：建議（Chrome 已實測；Arc、Edge 待擁有者手動驗證後轉「採用」）
- 相關：`docs/specs/bridge.md` R7（Q3）、`docs/specs/sources-and-authorization.md` R4、plan.md D9／D10／D11；Task P1-T013
- 原型：`scripts/spikes/bridge/`

## 證據等級

| 標記 | 意思 |
| --- | --- |
| 【實測】 | 本 Task 在本機實際跑過，附命令 |
| 【本機觀察】 | 在擁有者這台 Mac 上看到的檔案／版本，沒有實際跑通 |
| 【文件】 | 只查官方文件，附網址 |
| 【推論】 | 依上面幾項推出來的，沒驗證 |
| 【待手動】 | 需要擁有者在瀏覽器操作 |

## 決定（建議）

1. **通訊只用 Native Messaging**（瀏覽器用 stdio 啟動本機輔助程式），不開 localhost HTTP 埠。
2. **編輯器做成擴充功能頁**（`chrome-extension://<id>/...`），才能直接用 `runtime.connectNative`；content script 不能直接連，要經 service worker 轉送並驗 `sender`。
3. **資料夾由輔助程式開 macOS 原生選取器**（AppleScript `choose folder ... with multiple selections allowed`），完整路徑只留在輔助程式；瀏覽器端只拿到不透明 ID 與資料夾名稱。不用瀏覽器 File System Access。

## 理由

### 通訊方式比較

| 面向 | Native Messaging | localhost HTTP＋token |
| --- | --- | --- |
| 誰能連 | 只有 host manifest `allowed_origins` 列出的擴充功能（不能用萬用字元）【文件¹】；其他擴充功能被拒【實測】 | 任何本機程式、任何網頁都能嘗試連；只能靠 token 與 Origin 檢查擋。Chrome 142 起公開網頁連 loopback 要使用者許可，但不管本機其他程式【文件³】 |
| 呼叫者身分 | 瀏覽器把呼叫者 origin 當第一個參數傳給 host【文件¹】 | 要自己設計 token 發放與保存，token 外洩就失守 |
| 攻擊面 | 沒有監聽埠 | 有監聽埠，要處理 DNS rebinding、CSRF、埠衝突 |
| 安裝 | 每個瀏覽器各放一份 host manifest（位置見下） | 要常駐服務或開機自啟 |
| 限制 | host→瀏覽器單則 1 MB【文件¹】；host 由瀏覽器啟動，`connectNative` 期間存活【文件¹】 | 無訊息大小限制 |

R7 要求「固定操作清單、內容不能變成路徑或指令」兩種方式都得自己在 host 端做；但 Native Messaging 少了「誰都能連」這整類問題，對單一使用者自用（D17）沒有缺點換這個風險。

### 資料夾選取比較

| 面向 | 輔助程式原生對話框（建議） | 瀏覽器 File System Access |
| --- | --- | --- |
| R4 讀檔紀錄（路徑、時間、雜湊） | 輔助程式有真實路徑，直接記 | 瀏覽器只送內容，輔助程式拿不到路徑，紀錄只能信瀏覽器端 |
| R4 符號連結／實際路徑檢查 | 讀前 `realpath` 比對，原型已示範【實測，單元測試】 | 依瀏覽器實作，無法自己保證【推論】 |
| 增量更新（重新列舉、重讀已授權檔） | 輔助程式自己重新列舉，不用使用者再按允許 | 權限預設在關閉該 origin 最後一個分頁後失效；Chrome 122 起有「每次造訪都允許」【文件²】，但文件沒提擴充功能，Arc／Edge 行為未知 |
| R7 介面不傳路徑 | 回 ID＋名稱，路徑不出 host【實測，單元測試】 | 介面本來就只傳內容，符合 |
| 多選資料夾 | `with multiple selections allowed` 語法可編譯【實測，osacompile】；實際對話框行為【待手動】 | `showDirectoryPicker` 一次一個，要連續新增（F03 允許） |
| 風險 | 對話框可能跳在瀏覽器後面；macOS 隱私權（TCC）提示可能掛在瀏覽器名下【待手動】 | — |

結論：R4 要求輔助程式「只讀授權集合、記路徑與雜湊、讀前確認實際路徑」，這些都需要輔助程式自己持有路徑，所以選原生對話框。

## host manifest 位置（macOS，使用者層級）

| 瀏覽器 | 目錄 | 證據 |
| --- | --- | --- |
| Chrome | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` | 【文件¹】；另【實測】Chrome 155 會在 `<--user-data-dir>/NativeMessagingHosts/` 找，與「使用者資料夾下的 NativeMessagingHosts」一致 |
| Edge（穩定版） | `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/` | 【文件⁴】；本機未安裝 Edge |
| Arc | `~/Library/Application Support/Arc/User Data/NativeMessagingHosts/` | 【本機觀察】該目錄存在且已有其他工具的 host manifest；Arc 無官方文件；Arc 1.167.1 回報 Chromium 154 |

## 實測紀錄

全部在 macOS、Node v26.8.2、Chrome 155.0.8059.39。

1. `node --test scripts/spikes/bridge/test/` → 11/11 通過。內容：框編解碼（含中文、任意切碎、多則黏包）、輸入超限與壞 JSON 斷線、輸出超過 1 MB 拒絕、未知操作（`exec`、`readFile`、`__proto__`）拒絕、多餘欄位（`path`）拒絕、`pickFolders` 只回 ID 與名稱且解析符號連結、真實子行程 stdio 往返。
2. `node scripts/spikes/bridge/chrome-e2e.mjs` → PASS。做法：拋棄式暫存 profile（不碰使用者 profile 與家目錄的 host 註冊），CDP `Extensions.loadUnpacked` 載入原型，host manifest 寫進暫存 profile。結果：
   - service worker 與擴充功能頁各跑 4 案（ping、echo 中文、拒絕未知操作、拒絕 `path` 欄位）全過。
   - 另載一份不同 ID 的同一擴充功能，`connectNative` 得到 `Access to the specified native messaging host is forbidden.`。
3. 原型 host 只有 `ping`、`echo`、`pickFolders` 三個操作；`pickFolders` 不接受任何參數。

沒實測：Arc、Edge、真實 profile 的安裝路徑、原生對話框（需要人點）、TCC 提示、長時間連線。

## 代價

- 每個瀏覽器都要放 host manifest；extension ID 要固定（manifest `key` 或上架），否則開發版 ID 變了就要重裝（P1-T031）。
- host→瀏覽器單則 1 MB：PDF 預覽等大資料要分塊或改用其他方式（P1-T014 處理）。
- 每次 `connectNative` 都啟一個新 host 行程【文件¹】；多個分頁同時連會有多個行程。建議只讓 service worker 持有連線、頁面經 service worker 轉送（`connectNative` 會讓 service worker 保持存活，Chrome 105+【文件⁵】），否則 P1-T014 要處理多行程同時寫 SQLite。
- 從 Dock 啟動的瀏覽器 PATH 不含 Homebrew／nvm 的 node：host 包裝要寫死 node 絕對路徑（原型做法），正式版要自帶 runtime（ADR-0001 已預期）。
- 編輯器必須是擴充功能頁，不能是 localhost 網頁（影響 P1-T016）。

## 手動驗證步驟（擁有者，Chrome／Arc／Edge 各一次）

前提：在合併後的主 repo 根目錄執行（包裝檔會寫死 host 腳本的絕對路徑）。

1. 開 `chrome://extensions`（Arc：`arc://extensions`；Edge：`edge://extensions`），打開「開發人員模式」，「載入未封裝項目」選 `scripts/spikes/bridge/extension/`。抄下 extension ID。
2. 先看會寫什麼（不寫檔）：
   `node scripts/spikes/bridge/install.mjs --browser chrome --extension-id <ID>`（Arc 用 `arc`、Edge 用 `edge`）
3. 確認後加 `--yes` 實際寫入。
4. 點工具列的「RoleCraft bridge spike」圖示開測試頁 → 按「1. 執行 echo 自我測試」→ 預期 `PASS：8/8`。
5. 按「2. 開系統資料夾選取器」→ 記錄：對話框有沒有出現、是不是在最前面、能不能複選、有沒有跳 macOS 隱私權提示（掛誰的名字）、回傳只有 ID 與名稱。選 `~/Documents` 底下的資料夾各試一次。
6. 結果（PASS／FAIL 與輸出）貼回 P1-T013。
7. 移除：`node scripts/spikes/bridge/install.mjs --browser <同上> --uninstall --yes`，再到擴充功能頁移除原型。

## 參考

1. Chrome Native messaging：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
2. File System Access 持久權限：https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
3. Local Network Access：https://developer.chrome.com/blog/local-network-access
4. Edge Native messaging：https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging
5. Extension service worker 生命週期：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
