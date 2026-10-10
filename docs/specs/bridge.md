# 本機橋接介面

> 內容搬自已定稿的 `docs/spec-discussions/rolecraft-v01/spec.md`（2026-10-10，Codex 定稿確認 no_blockers）。
> F 開頭是原始功能描述，R 開頭是討論補充規則；**兩者衝突時以 R 為準**。D 編號見 `plan.md` 決策記錄。
> 權威範圍：擴充功能／編輯器／本機輔助程式之間的操作清單與邊界。

## R7 本機橋接介面的能力邊界（C7）

- 擴充功能、編輯器分頁與本機輔助程式之間只提供固定的操作清單，例如：送入職缺頁擷取內容、送入使用者選定的訊息、要求產生草稿、開啟編輯器（P1-T034：開啟編輯器改由擴充功能自己開分頁，不是橋接操作；現行清單見下方「操作」）。
- 頁面、文件、訊息與模型輸出的內容一律只是資料欄位，不能變成檔案路徑、CLI 參數、模型設定或指令。
- 檔案只能經由使用者在系統選取器加上預覽確認的流程進入授權集合（R4）；介面不接受外部傳入的任意路徑。
- 介面沒有送出訊息、投遞或在求職網站上填寫的操作（D7）。
- 來源驗證只回答「是誰在呼叫」，不代表請求的內容可信。
- Q3 通訊方式與資料夾選取：依 `docs/adr/0003-bridge-transport.md`（Chrome 已實測；待擁有者手動驗證 Arc／Edge）。

## 操作清單與通訊協定（P1-T034 定案）

欄位以 `packages/contracts/src/bridge/` 為準，這裡只寫語意。

### 操作

**誰可以呼叫**：content script 只能呼叫 `submit_job_capture`、`submit_message_capture`，且只在已註冊職缺頁主框架、只能送該站、自動擷取（清單唯一定義在 contracts `CONTENT_SCRIPT_OPERATIONS`，service worker 的 sender 檢查擋）。**其餘操作一律只限擴充功能頁**（編輯器）。

**共同規則（P1-T041）**：

- 請求指向既有物件只用 helper 配發的不透明 ID（1–128 個英數、`_`、`-`，開頭須英數；不能是路徑、旗標或模型名稱）。helper 只拿它查自己的資料，查不到回 `invalid_request`。
- 檔案、資料夾只能經 helper 開系統選取器進入（ADR-0003）；請求沒有任何路徑欄位，回應只給不透明 ID 與名稱（不含上層路徑）。
- 時間戳記（確認時間等）由 helper 決定，不由呼叫端給。
- 編輯器操作以「群組.動作」命名；群組對應 helper `src/handlers/<群組>/`，每個操作一個 handler 檔。尚未實作的回 `not_implemented`。

擷取（P1-T034）：

| 操作 | 誰可以呼叫 | 語意 |
| --- | --- | --- |
| `submit_job_capture` | 編輯器頁；content script（見上） | 送入職缺頁擷取內容，回職缺快照 id。編輯器手動貼上職缺也用它（擷取方式＝手動貼上） |
| `submit_message_capture` | 同上 | 送入使用者選定的訊息，回訊息草稿 id。編輯器手動貼上訊息也用它 |
| `request_draft` | 編輯器頁 | 要求產生回覆草稿，回工作 id（不送出，D7） |

編輯器頁專用（P1-T041；括號內為實作 Task）：

| 操作 | 語意 |
| --- | --- |
| `jobs.list`／`jobs.get` | 職缺快照摘要清單／單一快照全文（P1-T019） |
| `jobs.update` | 修改快照欄位：記為使用者改過、清除既有確認；擷取方式不能改 |
| `jobs.confirm` | 使用者確認快照；確認後才能用於生成（R10） |
| `import.pick_pdf` | helper 開系統檔案選取器（只限 PDF）並解析，回匯入 id 與檔名；取消回 cancelled（P1-T020） |
| `import.get` | 解析結果：原文（依閱讀順序的行）與欄位草稿；失敗只回原因，不當成功 |
| `import.save_corrections` | 暫存逐欄校正；不算確認 |
| `import.confirm` | 以使用者確認當下的內容寫入 Profile 並標為已確認；解析失敗時可確認手動輸入內容（D18） |
| `sources.pick_folders` | helper 開系統資料夾選取器（可連續新增），回資料夾 id 與名稱（P1-T021） |
| `sources.list_folders` | 已加入的資料夾與待確認／已授權數量 |
| `sources.preview` | 重新列舉一個資料夾（只列名稱、大小、類型，不讀內容），項目以 id／上層 id 組成樹；新候選為「待確認」（R4 增量更新） |
| `sources.update_authorization` | 勾選授權／取消授權；只能指向該資料夾預覽回過的項目，同一項不得同時出現在兩邊；取消後立即停止讀取 |
| `sources.remove_folder` | 移除資料夾：其下文件撤銷授權、停止讀取 |
| `applications.list`／`create`／`update`／`delete` | 投遞紀錄；實際投出只能指向匯出版本（R3）；整筆刪除（D19）；沒有代為投遞（P1-T028） |
| `providers.status` | 三家最近一次檢查的狀態：工具缺少／未登入／資格未知／可用／額度不足／尚未支援；只有 R5、R6 通過才是可用（P1-T030） |
| `providers.recheck` | 重新檢查一家 |
| `providers.list_candidates` | 該服務實際可用的模型候選（id 由 helper 配發＋顯示名稱） |
| `providers.select_candidate` | 選定候選並短驗證；只接受 helper 列過的候選 id，請求字串不會直接成為 CLI 參數 |
| `providers.start_login` | 開啟該服務的官方登入流程；不代為輸入、不擷取憑證（D3） |
| `export.create` | 以履歷版本匯出 PDF、建立不可變匯出版本（R3）；R1 未過回 not_ready（P1-T040） |
| `export.list_versions`／`export.get_version` | 匯出版本清單／單一版本內容 |
| `export.read_pdf` | 分塊讀匯出 PDF（見下「分塊」） |
| `claims.list_projects`／`claims.list`／`claims.get` | 專案清單／某專案的事實項／單一事實項（P1-T023） |
| `claims.confirm` | 確認事實項：請求帶使用者確認當下看到（可一併修正）的文字，功能與交付物另帶完成狀態（只能是使用者確認完成或計畫中）；helper 記錄時間與該文字（R1） |
| `claims.update` | 修改事實項內容；既有使用者確認失效，要重新確認 |
| `claims.reject` | 否決事實項，之後不得用於生成 |
| `resume.generate` | 針對已確認的職缺快照產生客製履歷，回工作 id（R9）（P1-T025） |
| `resume.list`／`resume.get` | 某職缺的履歷版本清單／版本與段落 |
| `resume.accept_section`／`reject_section` | 接受（只接受措辭，不確認事實項）／退回修改稿 |
| `resume.edit_section` | 自行編輯段落；引用只能增加，生成段落的引用不能移除（R1），違反回 `invalid_request` |
| `resume.delete_section` | 刪除整段（去掉引用的唯一方式） |
| `resume.confirm_section` | 逐段確認：請求帶該段目前全文，helper 記錄時間與全文；檢查 2 不通過的段落不能用它放行 |
| `resume.check_export` | R1 匯出前檢查：可否匯出與逐條問題（哪段、哪條、能否逐段確認） |
| `messages.list`／`messages.get` | 訊息與草稿清單／單一則（P1-T029） |
| `messages.update_draft` | 儲存使用者編輯的草稿；沒有任何送出操作（D7） |

- R7 舉例的「開啟編輯器」**不是橋接操作**：工具列按鈕由擴充功能 service worker 直接開擴充功能頁；helper 開不了瀏覽器分頁（也不得為此執行指令），所以 `open_editor` 已移除。
- 新增操作要先改本節，再改 contracts（additive），再在 helper 分派表加一列。

### 信封與請求 id

- 頁面 → service worker：`{ channel, request }`；頁面不帶 id（`chrome.runtime.sendMessage` 本身一問一答）。
- service worker → helper：`{ id, request }`；helper → service worker：`{ id, response }`。id 由 service worker 產生，是不透明字串（1–64 個英數、`_`、`-`），只用來對應回覆，helper 不解讀、不記日誌。
- 回覆依 id 對應，不靠順序；helper 同時處理多則，完成先回。同一連線上 helper 尚未回覆的請求有上限，客戶端達上限就排隊等名額。
- helper 對同一 id 只回一次：
  - id 缺漏或不合法（非字串、空、超長、含其他字元）：無法歸屬，helper 等在途請求回完，送一則 id 為 `null` 的 `invalid_request` 後斷線。
  - id 在本連線出現過（不論是否已回覆）：同上斷線；原請求照常只回一次。
  - id 合法但信封多帶或缺欄位：以該 id 回 `invalid_request`，連線繼續。
- 客戶端收到未知 id、id 為 `null` 或信封不合法：協定已不可信，斷線，在途請求回 `internal_error`。已逾時請求的晚到回覆直接丟棄；逾時請求在 helper 回覆前仍占名額，名額全被占住時斷線重來。
- 分塊（P1-T041）：host→瀏覽器單則 1 MB 上限仍在，信封形狀不變（一個請求 id 只回一則）。PDF 等大內容不放進單一回應，改由呼叫端逐塊請求：每塊是一則獨立請求（各自的請求 id），請求帶內容 id 與塊序號（從 0 起），回應帶第幾塊、共幾塊、整份位元組數、整份 SHA-256 與該塊 base64。每塊原始上限 512 KiB（base64 後連信封仍低於 1 MB），單一內容最多 128 塊。只用於不可變內容（例如匯出版本），所以不需要 helper 端狀態；呼叫端拼完後必須比對 SHA-256，不符就整份丟棄。塊序號超出範圍回 `invalid_request`。其他回應超過上限時 helper 仍以同一 id 回 `internal_error`。

### 錯誤碼

| 代碼 | 誰產生 | 語意 |
| --- | --- | --- |
| `invalid_request` | 頁面、service worker、helper | 請求不符 schema、發送者不允許該操作，或違反信封協定 |
| `internal_error` | 頁面、service worker、helper | helper 內部錯誤、回應不符 schema、協定錯誤，或編輯器頁連不到 service worker |
| `not_implemented` | helper | 該操作的服務尚未接上；不偽造成功 |
| `helper_unavailable` | service worker | 本機輔助程式未安裝、未啟動、連線中斷或送不出去 |
| `timeout` | service worker | 等待 helper 回覆逾時；不影響同一連線上的其他請求 |

錯誤訊息是給人看的固定文字，不回填請求內容；程式判斷只看代碼。

### 共用常數

Native Messaging host 名稱、頁面↔service worker 轉送通道、在途上限只定義在 contracts，helper、extension、editor 都從那裡匯入。
