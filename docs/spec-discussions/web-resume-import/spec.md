# 從求職網站履歷頁匯入、PDF 只負責輸出

> 這份是這場討論的**唯一規格**。Codex 唯讀，只有協調者寫這份檔。
> 引用程式碼一律寫「檔名＋識別字」，不寫行號、不用 markdown 連結。

## 1. 要解決什麼問題

使用者的履歷本來就放在求職網站（104、Cake、Yourator…），也會登入網站編輯。現行匯入要使用者先下載 PDF，再由本機從 PDF 文字層反推版面；2026-10-12 實測 104 PDF 修了多輪（跨頁誤判、部首相似字、日期歸段），而把 PDF 純文字交給 AI 整理時，因為丟失了字級與位置，AI 會把「職務類別」誤當職稱、漏掉描述。網頁 HTML 本身帶有標題、清單、「標籤：值」等結構，同一套「讀已開啟頁面 → AI 整理」可以套用到多個網站，不必每站寫一套解析器。

另外，產品輸出端缺少照片：台灣履歷通常附照片，現行匯出 PDF 沒有照片欄位。

## 2. 已經拍板的決定

| # | 決定 | 誰決定的 |
|---|---|---|
| D1 | 匯入以「擴充功能讀取使用者已登入、已開啟的求職網站履歷頁」為主路線，各網站共用同一套流程（讀頁面結構 → 本機精簡與去個資 → AI 整理欄位 → 照抄原文檢查 → 使用者逐欄確認） | 擁有者（2026-10-12） |
| D2 | PDF 在產品中只負責**輸出**：使用者可加入照片，匯出自己的履歷 PDF | 擁有者 |
| D3 | PDF 匯入不刪除；網頁匯入可用前照常提供，可用後從畫面拿掉入口，程式保留作備援 | 擁有者（選「先藏起來」） |
| D4 | 擷取只在使用者明確觸發時發生（沿用 jobs-and-messages F06：使用者授權並明確觸發後才讀取） | 既有規格 |
| D5 | LinkedIn 只走手動貼上（plan.md D8） | 既有決策 |
| D6 | 不自動送出任何訊息或投遞（plan.md D7）；bridge.md R7 目前明定沒有「在求職網站填寫」的操作 | 既有決策 |
| D7 | 姓名與聯絡資料在本機處理、不送模型；照片永遠不送模型 | 擁有者（P1-T069 裁定延伸） |
| D8 | AI 整理要經「照抄原文檢查」（P1-T069 規則：值必須出自引用的來源單位；描述以整個來源單位為準；日期須年份或年月格式；英數詞界），最後由使用者逐欄確認（R10） | 既有規格 |

## 3. 限制

- **條款未查**：104／Cake／Yourator 是否允許個人擴充功能讀取「使用者自己的履歷頁」尚未查證（P1-T017 範圍已加入；docs/specs/open-verifications.md 也列為待查）。條款不允許的網站不能上線此功能。
- **擴充功能權限**：manifest 只有 `activeTab`、`scripting`、`nativeMessaging`，沒有 host_permissions、沒有宣告式 content_scripts（`apps/extension/src/manifest.ts` 的 `PERMISSIONS`）。要維持「使用者按下才注入、只讀當前分頁」的最小權限。
- **頁面內容是資料不是指令**（bridge.md R7）；content script 只能呼叫白名單操作（contracts `bridge/operations.ts` 的 `CONTENT_SCRIPT_OPERATIONS`，目前只有 `submit_job_capture`、`submit_message_capture`），service worker 會驗發送者框架、網址與平台（`apps/extension/src/relay/handler.ts` 的 `handleRelay`、`relay/sender.ts` 的 `authorizeSender`）。
- **不取 cookie、不代登入、不在背景開頁**；只讀使用者自己開著的那一頁。
- **計費**：只走使用者已選定的訂閱模型（providers R5、R6）；未選模型或不可用時不呼叫。
- **單檔 300 行、套件相依方向**（docs/specs/architecture.md），lint 會擋。
- **既有 Profile 形狀**：`packages/contracts/src/entities/profile.ts` 的 `Profile`（personalInfo 是「標籤→值」、experiences、skills、pdfParseConfirmed）；匯出由已確認的 Profile 帶入公司、職稱、日期（R1）。

## 4. 現在的程式長什麼樣

- **擴充功能擷取骨架已有、但沒有任何站真的在讀內容**：
  - 快捷鍵 `capture-page` → `apps/extension/src/background/actions.ts` 的 `triggerCapture`：用 `sites/registry.ts` 的 `findSiteForUrl` 比對網址，符合才 `chrome.scripting.executeScript` 注入 `sites/<platform>.js`。
  - `SITE_REGISTRY` 只有 104 職缺頁（host `www.104.com.tw`、路徑 `/job/`）。
  - `sites/104/adapter.ts` 的 `adapter104.capture` 目前回 null（佔位），頁面只顯示「尚未支援」提示（`sites/104/notice.ts` 的 `showCaptureNotice`）。
  - 抽象：`sites/types.ts` 的 `SiteAdapter{platform, capture(doc, pageUrl)}`，回 `SubmitJobCaptureRequest`；`sites/runtime.ts` 的 `runSiteCapture` 經 service worker 轉給 helper。
- **履歷匯入（PDF）**：`packages/resume-import`（`extract.ts` 的 `extractResumePdf`、`draft/layout104/build-104.ts` 的 `build104`、`draft/header-name.ts`）；AI 整理在 `packages/pipeline/src/resume-parse/`（`prepare.ts` 的 `prepareResumeParse`、`personal.ts` 的 `extractPersonal`、`redact.ts` 的 `createRedactor`、`check.ts` 的 `checkResumeParse`、`match.ts`、`run.ts` 的 `runResumeParse`）。AI 輸入目前是「頁-行」編號的純文字行。
- **helper 匯入操作**（`apps/helper/src/handlers/import/`）：`import.pick_pdf`、`import.get`、`import.save_corrections`、`import.confirm`、`import.ai_parse`、`import.ai_status`；AI 背景執行在 `ai-runner.ts` 的 `createAiParser`（狀態只在記憶體），輸入由 `ai-source.ts` 的 `aiSourceOf` 組成。
- **編輯器匯入頁**：`apps/editor/src/pages/import/ImportPage.tsx`、`useAiParse.ts`（每次有自己的操作 token、輪詢）。
- **PDF 匯出**：`packages/pdf-export` 的 `model.ts` `ResumeDocument{name, headline?, contacts, sections}`，沒有照片欄位；`template/html.ts` 的 `buildHtml` CSP 已允許 `img-src data:`；以使用者已安裝的 Chrome（puppeteer-core）繪製。helper `handlers/export/`（`export-create.ts`）由 Profile＋ResumeVersion 組文件。
- **寫回網站**：完全沒有；`bridge/operations.ts` 檔頭與 bridge.md R7 明寫刻意不提供。

## 5. 規格

### 5.1 擷取（擴充功能）

- 新增「履歷頁」頁型：每個支援的網站在 registry 註冊履歷頁網址規則（與職缺頁分開）。實際網址規則待各站 DOM 樣本確定（Q2）。
- 使用者在已登入的履歷頁按快捷鍵（或工具列選單）觸發；網址不符時沿用現行提示，不注入。
- content script **不送原始 HTML**，在頁面內把可見內容精簡成「結構化區塊清單」：每個區塊帶種類（標題 h1–h6、段落、清單項、標籤＋值、表格列）、層級、可見文字，並給穩定編號（例如 `b12`）。忽略 script、style、隱藏元素、表單控制項的值以外的屬性、網址中的追蹤參數。每頁區塊數與總字數設上限，超過就截斷並標示。
- 新增 content script 白名單操作 `submit_resume_capture`（相加）：`{platform, url, capturedAt, blocks[]}`；service worker 照現行規則驗框架、網址（必須符合該站履歷頁規則）、平台。
- 照片：本規格**不**從網頁抓照片（需要另外取圖、可能帶 cookie）；照片由使用者在 RoleCraft 自己選本機檔（5.4）。

### 5.2 helper：建立匯入工作階段

- 收到 `submit_resume_capture` 後建立一個匯入工作階段（與 PDF 匯入同一種資料流，來源標「網頁：<平台>」），不自動呼叫模型。
- 編輯器匯入頁需要能看到「最近一次網頁擷取」：新增（相加）查詢操作，或沿用 `import.get` 擴充來源種類（Q3）。
- 擷取內容只在本機資料區；保存期限與 PDF 匯入暫存一致。

### 5.3 AI 整理與檢查（沿用 P1-T069，輸入換成區塊）

- 送模型前在本機：用既有 `extractPersonal`／`createRedactor` 規則抽出並移除姓名與聯絡資料（標籤＋值區塊直接判斷標籤，比 PDF 更可靠），由本機預填個人資料。
- 提示中的每個來源單位帶區塊種類與層級（例如「[b12 h3] 銷售業務」「[b13 label=職務類別] 內勤業務」），讓模型分得出職稱、職務類別、描述。
- 照抄檢查改以「區塊」為來源單位：值必須出自引用的區塊；描述必須等於一或多個完整區塊；日期、至今、詞界規則沿用 `match.ts`。
- 使用者觸發 AI 整理（選好擷取後自動開始或按鈕開始，沿用 P1-T069 的非 104 自動行為，Q4）；失敗或不可用時，畫面顯示擷取到的區塊供手動輸入。

### 5.4 照片與 PDF 輸出

- Profile 相加選填 `photo`：只存資料區內的檔案參照與基本資訊（格式、尺寸），不存在資料庫大欄位以外的地方；不進 repo。
- 使用者在匯入頁或個人資料區按「加入照片」：helper 開系統選取器（只限 JPEG／PNG，大小上限，例如 5 MB），讀檔後重新編碼或至少驗證檔頭；可更換、刪除。
- 匯出 PDF：`ResumeDocument` 相加選填照片（data URI），模板在頁首放照片；沒有照片時版面照常。照片不送模型、不出現在任何提示。

### 5.5 PDF 匯入入口

- 網頁匯入在某網站可用前，匯入頁照常提供 PDF 匯入；可用後匯入頁預設顯示網頁匯入，PDF 匯入入口移除（程式與測試保留）。

### 5.6 內容回填到求職網站（分階段）

- **第一階段（本規格）**：履歷頁與自介頁每個欄位提供「複製」按鈕（個人資料各欄、每段經歷的公司／職稱／日期／描述、技能、自介），使用者自己貼到網站。不需要任何網站權限。
- **第二階段（不在本規格，見 Q5）**：104 自動填入——擴充功能在使用者開著的 104 履歷編輯頁上，先列出「欄位、原值、新值」給使用者確認，一次填一段，只填不按儲存。需要修改 bridge.md R7 與 D7 的文字並查條款。

## 6. 不在範圍內

- 自動填入求職網站（第二階段另議）。
- 從網頁抓照片。
- 代登入、讀 cookie、在背景開頁或爬取多頁。
- LinkedIn 自動擷取。
- 履歷內容的版本同步（網站改了之後自動更新 RoleCraft）。
- OCR、圖片 PDF。

## 7. 還沒決定的

| # | 問題 | 選項 | 誰要決定 |
|---|---|---|---|
| Q1 | 條款查不到明文或不允許時怎麼辦 | A 該站不提供網頁匯入；B 擁有者自行承擔、標示風險 | 擁有者 |
| Q2 | 各站履歷頁網址規則與「預覽頁 vs 編輯頁」讀哪一個 | 依 P1-T017 樣本決定；建議讀「預覽／公開檢視頁」（結構完整、無表單干擾） | 擁有者提供樣本後協調者提案 |
| Q3 | 編輯器怎麼拿到網頁擷取 | A 新增 `import.latest_capture`；B 擴充 `import.get` 的來源種類 | 協調者 |
| Q4 | 網頁擷取後是否自動呼叫 AI | A 自動（沿用非 104 PDF 的行為）；B 一律按鈕觸發 | 擁有者 |
| Q5 | 第二階段自動填入要不要做、何時做 | A 不做；B 條款查完、MVP 後再開規格 | 擁有者 |
| Q6 | 照片大小、格式、是否重新壓縮 | 建議 JPEG／PNG、上限 5 MB、匯出時縮到頁首尺寸 | 協調者 |
| Q7 | 104 PDF 的版面規則（P1-T066）是否維持 | 建議維持作 PDF 備援，不再加功能 | 擁有者 |

## 8. 驗收

- 擴充功能：每個上線網站的履歷頁有去識別化 DOM 樣本 fixture；擷取區塊、網址規則、白名單操作有測試；網址不符、非主框架、平台不符被拒。
- 去個資：送給模型的提示字串測試中不含姓名、電話、email、地址、照片。
- 照抄檢查：以區塊為來源的捏造案例被丟棄（沿用 P1-T069 測試類型）。
- 照片：選取、更換、刪除、匯出含照片／不含照片兩種版面；照片不出現在任何提示。
- 複製按鈕：每個欄位複製的內容等於畫面上已確認的值。
- `npm run verify` 綠；協調者以開發入口（P1-T068）實跑一次；擁有者在真實瀏覽器以自己的 104 履歷頁實跑一次。
