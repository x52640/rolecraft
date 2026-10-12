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
- host 註冊（P1-T059）：開發用 `npm run dev:install` 只給開發者自己的 Mac，包裝檔寫死本機 node 與 repo 內 helper 原始碼路徑、允許清單用「載入未封裝項目」當下的擴充功能 ID（未封裝擴充功能的 ID 隨資料夾位置而定，變了要重跑），只刪自己寫的檔；正式安裝（P1-T031）自帶 Node runtime、固定擴充功能 ID、使用者不需打終端指令（D10）。

## 操作清單與通訊協定（P1-T034 定案）

欄位以 `packages/contracts/src/bridge/` 為準，這裡只寫語意。

### 操作

**誰可以呼叫**：content script 只能呼叫 `submit_job_capture`、`submit_message_capture`，且只在已註冊職缺頁主框架、只能送該站、自動擷取（清單唯一定義在 contracts `CONTENT_SCRIPT_OPERATIONS`，service worker 的 sender 檢查擋）。**其餘操作一律只限擴充功能頁**（編輯器）。

**共同規則（P1-T041）**：

- 請求指向既有物件只用 helper 配發的不透明 ID（1–128 個英數、`_`、`-`，開頭須英數，所以不可能是路徑或旗標），含既有擷取操作的 `messageDraftId`、`jobSnapshotId` 與巢狀的事實項引用。helper 只拿它查自己配發的清單，不把請求字串直接當成模型參數或其他參數；查不到回 `invalid_request`。
- 職缺網址只收 http／https（`file:`、`javascript:`、`data:` 等一律拒）。
- 檔案、資料夾只能經 helper 開系統選取器進入（ADR-0003）；請求沒有任何路徑欄位，回應只給不透明 ID 與名稱（不含上層路徑）。
- 時間戳記（確認時間等）由 helper 決定，不由呼叫端給。
- 一個資料區同時只准一個 helper（P1-T052，擁有者裁定 #13）：helper 開資料區前先取得資料區鎖（作業系統檔案鎖，持有的行程結束即自動放掉，不靠 pid 判斷）。鎖被另一個仍在執行的 helper 持有時，helper 不退出、不開資料庫也不清掃；`providers.*`、`sources.*` 照沒有資料區時運作，其餘操作回 `helper_unavailable`（固定訊息見錯誤碼表），且每次收到這類操作都再試一次取得鎖，對方結束後就接手。啟動時最多等 2 秒讓對方放鎖（同一瀏覽器重連時舊 helper 可能正在結束）。
- 啟動清掃（P1-T052，擁有者裁定 #14）：已清除素材（D19）的 PDF 刪不掉仍擋啟動；一般孤兒 PDF 刪不掉只記不含路徑的固定日誌、照常啟動，下次清掃再試。刪除素材（含 `claims.reject`）與 `applications.delete` 在刪資料列的同一交易記下待刪 PDF，提交後只刪這次釋出的檔；刪不掉不讓操作失敗，紀錄保留，啟動清掃不套寬限期立即重試，刪不掉就擋啟動（不算一般孤兒）。仍被匯出版本引用的 PDF 不刪。
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
| `providers.reverify_claude` | 重新啟用 Claude（D24、P1-T062）：目前 CLI 版本停用或重新驗證未完成時，helper 在背景重跑注入測試、立即回覆；進度與結果看 `providers.status` 的 `versionCheck`／`lastReverify`（只有 Claude 有）。其他情況回「不需要」、不呼叫模型；沒有不測就放行 |
| `providers.start_login` | 開啟該服務的官方登入流程；不代為輸入、不擷取憑證（D3） |
| `export.create` | 以履歷版本匯出 PDF、建立不可變匯出版本（R3）；R1 未過，或有段落阻擋（與 `resume.check_export` 的 blockers 同一套規則：未接受、已退回、缺段落歸屬、對不到經歷）回 not_ready，不呼叫匯出器（P1-T040、P1-T025） |
| `export.list_versions`／`export.get_version` | 匯出版本清單／單一版本內容 |
| `export.read_pdf` | 分塊讀匯出 PDF（見下「分塊」） |
| `claims.list_projects`／`claims.list`／`claims.get` | 專案清單／某專案的事實項／單一事實項（P1-T023） |
| `claims.list_unassigned` | 未歸專案的事實項（D23、P1-T061）：不在任何專案引用清單裡的事實項，含狀態與來源片段；已刪除（否決）的不列出。排序固定為建立順序（先建立的在前），不依來源文件重排 |
| `claims.confirm` | 確認事實項：請求帶使用者確認當下看到（可一併修正）的文字、畫面當時顯示的複核狀態，功能與交付物另帶完成狀態（只能是使用者確認完成或計畫中）；helper 在同一交易比對複核狀態，不符回 `invalid_request` 且不寫入（畫面應重新讀取），相符才記錄時間與該文字（R1、R2） |
| `claims.update` | 修改事實項內容；內容有變時既有使用者確認失效、舊來源不再替新文字背書：複核狀態改待複核（來源已移除維持），完成狀態退回未知，要重新確認 |
| `claims.reject` | 否決事實項，之後不得用於生成：先移除各專案的引用，再依 D19 刪除素材；事實項已不存在時仍清引用並回成功（可重試） |
| `claims.create_projects` | 使用者確認專案分組後建立專案（D23、P1-T063）：請求帶每組名稱與文件 ID（建議回過的不透明 ID）；文件須目前已授權、尚未屬於任何專案、同一請求不重複，任一不符回 `invalid_request` 整批不建立。同一交易建立專案、記下文件歸屬，並依 evidence-model「專案分組與事實項歸屬」把未歸專案的事實項歸入新專案；摘要為空字串 |
| `claims.rename_project` | 專案改名 |
| `claims.merge_projects` | 把 `projectId` 併入 `intoProjectId`：事實項與文件移到目標專案，來源專案刪除；兩者相同回 `invalid_request` |
| `claims.move_claim` | 把事實項移到另一專案（`projectId`）或移回未歸專案（`projectId: null`）；一個事實項至多在一個專案 |
| `claims.delete_project` | 刪除專案：事實項回到未歸專案、文件不再屬任何專案，事實項本身不刪 |
| `resume.generate` | 針對已確認的職缺快照產生客製履歷，回工作 id（R9）（P1-T025） |
| `resume.list`／`resume.get` | 某職缺的履歷版本清單／版本與段落；`get` 另回 `originals`：工作經歷段落對到的 Profile 經歷描述（原文對照用，其他段落沒有原文） |
| `resume.accept_section`／`reject_section` | 接受（只接受措辭，不確認事實項）／退回修改稿；退回後可直接重新接受（等於撤回退回） |
| `resume.edit_section` | 自行編輯段落；引用只能增加，生成段落的引用不能移除（R1），新增引用必須是存在的事實項，違反回 `invalid_request`。既有引用的宣稱完成程度被調低（含拿掉標示）時，請求必須帶 `completionDowngradeAcknowledged: true`（使用者已重看措辭），否則回 `invalid_request`。任何變動都清掉逐段確認、段落回到待接受 |
| `resume.delete_section` | 刪除整段（去掉引用的唯一方式） |
| `resume.confirm_section` | 逐段確認：請求帶該段目前全文，helper 記錄時間與全文；檢查 2 不通過的段落不能用它放行 |
| `resume.check_export` | 匯出前檢查：R1 逐條問題（哪段、哪條、能否逐段確認）＋ `blockers`（非空白段落未接受、已退回、缺段落歸屬、對不到 Profile 經歷）；`ready`＝R1 通過且沒有 blocker |
| `messages.list`／`messages.get` | 訊息與草稿清單／單一則（P1-T029） |
| `messages.update_draft` | 儲存使用者編輯的草稿；沒有任何送出操作（D7） |
| `analysis.start` | 分析授權資料夾產生事實項（P1-T060）：先重新列舉已加入的資料夾、只讀授權集合（R4）同步來源文件（新增、內容變更、刪除、撤銷授權），依 R2 重新判定既有事實項（含撤銷後重新授權的恢復）並寫回，再對新增或變更的已授權文件做增量分析。已有執行中的分析就回同一個工作 id；最近一次分析已暫停就改為續跑（續跑前重做 R6，D21：只有使用者按下才續跑），從第一個未完成單元開始；暫停期間來源文件變了（計畫過期）就重新規劃新工作。沒有選定且可用的模型、R6 不通過、資料夾無法列舉、超過輸入預算回 `invalid_request`（固定訊息），不呼叫模型。回 `{ workJobId }`；沒有需要分析的文件時 `workJobId` 為 null（來源變更判定仍已寫回） |
| `analysis.status` | 最近一次分析工作：狀態（執行中／完成／已暫停＋暫停原因／被擋＋原因）、已完成與總單元數、新增與更新的事實項數；沒有分析過回 null。工作狀態存資料區，helper 重開後仍查得到；重開後原本執行中的改為已暫停（interrupted），不自動續跑（D21） |
| `analysis.suggest_projects` | AI 建議專案分組（D23、P1-T063），只由使用者按下觸發：輸入見 evidence-model「專案分組與事實項歸屬」（已授權、未屬專案、有摘要的文件；只送摘要與相對名稱）。在背景執行、立即回覆；已有執行中的建議就不重送。執行走選定模型＋訂閱檢查包裝（R5、R6 每次重做，R6 紀錄照存）。沒有選定且可用的模型、沒有可分組的文件、超過輸入預算回 `invalid_request`（固定訊息），不呼叫模型。不建立任何專案 |
| `analysis.project_suggestion` | 最近一次分組建議：執行中／完成（各組名稱與文件、未分組文件；文件只給 ID 與相對名稱）／失敗＋原因（R6 不通過、服務錯誤、輸出不合格、額度用完、取消）。只存在 helper 記憶體，helper 重開後為 null（要再按一次）；沒有建議過回 null |
| `intro.generate` | 針對已確認的職缺快照產生 300 字內投遞自介（D25、P1-T064；規則見 jobs-and-messages「投遞自介」），只由使用者按下觸發：在背景執行、立即回產生狀態；同一快照已有執行中的就不重送。快照不存在或未確認、沒有可用事實項、沒有選定且可用的模型、超過輸入預算回 `invalid_request`（固定訊息），不呼叫模型。沒有任何送出或投遞（D7） |
| `intro.get` | 最近一份自介、依目前事實項重跑的檢查結果（字數、第一個會停用複製的問題、使用者自己加的承諾字眼提示、引用的事實項對照）、最近一次產生狀態（執行中／成功／失敗＋原因；檢查不通過另帶問題代碼；只在 helper 記憶體）；沒有自介時自介與檢查為 null |
| `intro.update` | 儲存使用者編輯（只存檔、不送出），標為經使用者編輯，回傳重跑後的檢查結果；還沒有自介回 `invalid_request` |

- R7 舉例的「開啟編輯器」**不是橋接操作**：工具列按鈕由擴充功能 service worker 直接開擴充功能頁；helper 開不了瀏覽器分頁（也不得為此執行指令），所以 `open_editor` 已移除。
- 新增操作要先改本節，再改 contracts（additive），再在 helper 分派表加一列。
- 分析（`analysis.*`，P1-T060）的單元在同一個交易寫入新事實項、既有事實項的更新（同文件矛盾升級、R2 判定）與工作狀態，不半套寫入（R9）。新產生的事實項在同一交易依 evidence-model「專案分組與事實項歸屬」自動歸入其文件所屬專案（P1-T063）；歸不進去的列在未歸專案（`claims.list_unassigned`）。

### 信封與請求 id

- 頁面 → service worker：`{ channel, request }`；頁面不帶 id（`chrome.runtime.sendMessage` 本身一問一答）。
- service worker → helper：`{ id, request }`；helper → service worker：`{ id, response }`。id 由 service worker 產生，是不透明字串（1–64 個英數、`_`、`-`），只用來對應回覆，helper 不解讀、不記日誌。
- 回覆依 id 對應，不靠順序；helper 同時處理多則，完成先回。同一連線上 helper 尚未回覆的請求有上限，客戶端達上限就排隊等名額。
- helper 對同一 id 只回一次：
  - id 缺漏或不合法（非字串、空、超長、含其他字元）：無法歸屬，helper 等在途請求回完，送一則 id 為 `null` 的 `invalid_request` 後斷線。
  - id 在本連線出現過（不論是否已回覆）：同上斷線；原請求照常只回一次。
  - id 合法但信封多帶或缺欄位：以該 id 回 `invalid_request`，連線繼續。
- 客戶端收到未知 id、id 為 `null` 或信封不合法：協定已不可信，斷線，在途請求回 `internal_error`。已逾時請求的晚到回覆直接丟棄；逾時請求在 helper 回覆前仍占名額，名額全被占住時斷線重來。選取器操作（`import.pick_pdf`、`sources.pick_folders`，P1-T045）排隊時用一般逾時，真正送出後改用較長的選取器逾時（原生對話框上限＋解析餘裕，常數在 contracts）；排隊中的請求逾時仍未送出、且名額裡有已逾時請求時，也視為 helper 卡死而斷線重來。
- 分塊（P1-T041）：host→瀏覽器單則 1 MB 上限仍在，信封形狀不變（一個請求 id 只回一則）。PDF 等大內容不放進單一回應，改由呼叫端逐塊請求：每塊是一則獨立請求（各自的請求 id），請求帶內容 id 與塊序號（從 0 起），回應帶第幾塊、共幾塊、整份位元組數、整份 SHA-256 與該塊 base64。每塊原始上限 512 KiB（base64 後連信封仍低於 1 MB），單一內容最多 128 塊。只用於不可變內容（例如匯出版本），所以不需要 helper 端狀態；呼叫端拼完後必須比對 SHA-256，不符就整份丟棄。塊序號超出範圍回 `invalid_request`。其他回應超過上限時 helper 仍以同一 id 回 `internal_error`。

### 錯誤碼

| 代碼 | 誰產生 | 語意 |
| --- | --- | --- |
| `invalid_request` | 頁面、service worker、helper | 請求不符 schema、發送者不允許該操作，或違反信封協定 |
| `internal_error` | 頁面、service worker、helper | helper 內部錯誤、回應不符 schema、協定錯誤，或編輯器頁連不到 service worker |
| `not_implemented` | helper | 該操作的服務尚未接上；不偽造成功 |
| `helper_unavailable` | service worker、helper | service worker：本機輔助程式未安裝、未啟動、連線中斷或送不出去。helper（P1-T052，擁有者裁定 #13）：資料區正由另一個 helper 使用時，需要本機儲存的操作（`providers.*`、`sources.*` 以外的全部操作）回固定訊息「RoleCraft 正在另一個瀏覽器使用中，請先關閉該瀏覽器的 RoleCraft」 |
| `timeout` | service worker | 等待 helper 回覆逾時；不影響同一連線上的其他請求 |

錯誤訊息是給人看的固定文字，不回填請求內容；程式判斷只看代碼。

### 共用常數

Native Messaging host 名稱、頁面↔service worker 轉送通道、在途上限只定義在 contracts，helper、extension、editor 都從那裡匯入。
