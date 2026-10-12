# 已知殘餘（記錄，不擋上線）

由協調者維護；收官時新增，解決後刪除。

- 相依方向只有 lint 擋，typecheck 擋不住（套件 exports 指向 src）；pipeline 未啟用 Node 型別，需要 I/O 時再加。
- `.prettierignore` 排除所有 `*.md`；文件格式交給 verify:docs。

- verify:docs 只檢查 `[文字](路徑)` 連結；文件中反引號路徑不檢查（許多指向尚未建立的程式檔）。
- 手動改 Task status 後必須跑 `npm run task:index`，否則 verify:docs 擋（產生物新鮮度檢查）。

- 橋接（ADR-0003）：只由 service worker 持有 Native Messaging 連線，頁面經它轉送（避免多個 host 行程同寫 SQLite）；host→瀏覽器單則 1 MB，大資料要分塊（P1-T014、P1-T027）；編輯器必須是擴充功能頁（P1-T016）。


- resume-import（P1-T009）：無文字層／亂碼／順序異常門檻皆 20%（暫定）；姓名只認有標籤寫法；中文 PDF 未實測，待 P1-T020 用擁有者 104 PDF 調整；欄位草稿是否進 contracts 由 P1-T020 決定。

- storage（P1-T006）：外部傳入時間原樣保存（未轉 UTC），清單依寫入順序；要依時間排序或查區間時，寫入改統一 UTC。ID／雜湊讀取驗證仍寬鬆（新格式只用於自產值）。

- PDF 匯出（ADR-0005）：HTML＋CSS 交給本機 Chrome 背景列印（puppeteer-core），附 Noto Sans TC 400／700 完整字型（+14.2 MB，D17 自用可接受），匯出前用 HarfBuzz 裁字型；缺字會被 Chrome 偷補系統字型，P1-T027 要擋。依賴本機 Chrome；Arc 啟動逾時未查明、Edge 未裝。


- sources（P1-T008）：macOS 讀檔與列舉的 symlink 競態只能縮小窗口（Node 無 openat／F_GETPATH），120 秒壓測 239 萬次 0 洩漏；徹底消除需原生模組。

- providers（P1-T010）：`assertExecutablePath` 擋 sh／bash／zsh／env／node 等直譯器（claude 為原生執行檔，P1-T011 已確認不受影響）。defineCommand 以 `as`＋eslint-disable 或別名 import 仍可繞過，靠審查。

- storage（P1-T007）：`sweepStorage(db, fileStore)` 要在 helper 啟動時呼叫一次（尚未接上，下一個動 helper 的 Task 處理）。素材刪除只能經 `deleteMaterial`。

- 數字檢查（P1-T002）：fail-closed；數字後接未知字母（3D、5G、100ms、1080p）一律無法辨識需逐段確認，誤擋偏吵，可改整串字面比對；「一個／一套」等列入排除表（代價：「一個人完成」不檢查）。

- Claude CLI（ADR-0002）：隔離模式仍開本機訊息 socket（`/tmp/cc-socks/<pid>.sock`），無旗標可關；必須用真實 HOME，CLI 每次執行會改寫 `~/.claude.json`（CLI 自身狀態）；CLI 自動更新，P1-T012 要記版本、版本變了重跑 spike。P1-T011 的對抗驗證併入 P1-T012（需真實 CLI 呼叫，避免重複耗額度）。


- Claude 適配器（P1-T012）：要真正強制「init 異常立即終止」需改 core（提供包裝 spawn 的掛點；取消與輸出超量已改為終止整個程序群組，P1-T037）；目前 helper 必須用 `claudeRunDeps` 取得 deps。上下文上限與 CLI 版本經 `executeDetailed` 取得，core 的 `ExecutionResult` 尚未擴充。
- Claude CLI 自動重新驗證（P1-T039）已實作，但 helper 尚未注入已驗證版本的保存介面：CLI 一更新就顯示「尚未支援」、不會自動重驗；各群組各建一個 ClaudeService，版本閘門互斥不跨群組。自動重驗不涵蓋使用者層 CLAUDE.md／外掛／hooks 誘餌（靠 init 欄位嚴格檢查）。

- 第二輪（2026-10-10）殘餘：
  - 授權集合、匯入暫存、供應商狀態／選定模型、RunCheckRecord 只存在 helper 記憶體，重啟即失（P1-T020、T021、T030）。
  - contracts 沒有工作狀態查詢與續跑操作；編輯器輪詢 `messages.get`／重新整理（P1-T025、T029）。
  - domain `extractNumbers` 不認倍數詞（翻倍、double），匯出檢查對使用者自寫文字放行；生成端已另擋（P1-T024）。
  - 沒有任何流程產生 ProjectEvidence，事實項頁的專案清單實際為空（P1-T023）。
  - 確認事實項只比對複核狀態，不比對來源片段是否重新定位（P1-T023）。
  - 跨 helper 行程：「刪素材撞上另一行程正在匯出」的競態仍在（啟動清掃已加 15 分鐘寬限期）（P1-T040）。
  - 預覽與大型 PDF 原文沒有分頁／分塊，超過 1 MB 回固定錯誤或 internal_error（P1-T020、T021）。
  - 職缺匹配與待補資訊沒有 contracts 型別與存放位置（P1-T024、T025）。
- codex 補審修正（2026-10-11）殘餘：
  - `deleteMaterial` 先提交再刪孤兒 PDF：15 分鐘內匯出的 PDF 刪檔失敗、helper 又在寬限期內重啟時，啟動清掃會跳過它；使用者重試刪除會立即刪掉（P1-T044）。
  - 選取器解析餘裕固定 60 秒；大 PDF 實測若超過要調整（P1-T045）。
- 擁有者裁定實作（2026-10-11）殘餘：
  - 「正在另一個瀏覽器使用中」字串在 helper（`services/data-dir.ts`）與編輯器（`bridge/helper-busy.ts`）各一份，改措辭要兩邊一起改，否則退回一般「連不到」文字（P1-T052、T054）。
  - 舊 helper 斷線後仍在跑背景工作時會持有鎖，同一瀏覽器新開的 helper 暫時顯示占用；資料區放網路磁碟不支援（P1-T052）。
  - `claims.reject` 對從未存在的 ID 回 `invalid_request`，只有曾刪過的才回成功；`applications.delete` 重試對已不存在的紀錄回 `application_not_found`（P1-T052）。
- 第三輪 codex review 修正（2026-10-11）殘餘：
  - 網址結尾的全形方括號群組、後面不再接網址字元時當註記去掉：`?filter［admin］` 與 `?filter［user］` 比成相同（為了不誤拒 `［GitHub］` 註記；半形 `[admin]` 會保留）（P1-T056）。
  - 逗號、驚嘆號後面只接普通字、沒有 `= & ? # /` 時不算截斷（`alice，-fake` 截成 `alice`）；罕見寫法會被多擋（`https://a.com，詳見第3/4頁`）（P1-T056）。
  - 「參天」等未列入一般詞的寫法算 3（寧可多抽）（P1-T056）。
- 分析流程接進 helper（2026-10-11）殘餘：
  - 分析出的事實項沒有歸入任何專案（ProjectEvidence 產生來源另案），事實項頁看不到（P1-T060）。
  - 撤銷當下只對「所有引用來源都已非授權」的事實項套 R2；部分來源仍授權的等下次分析判定。生成／草稿的來源關卡較嚴：任一引用來源不可用就當來源已移除（使用者確認過的除外）（P1-T060）。
  - 檔案被刪除要等生成／草稿前的重新列舉或下次分析才知道；有資料夾列舉失敗時其下文件在關卡內一律當不可用（P1-T060）。
  - runner 去重用的既有事實項是啟動當下的；分析期間被否決的事實項若同一份文件再次產出，會以新事實項出現（P1-T060）。
  - `deleteMaterial` 刪來源文件時不清 `analyzed_documents`／`document_summaries`（摘要只取已授權文件，不影響輸出）（P1-T060）。
  - 事實項存檔中「取消」仍可按：只關閉編輯框，存檔照常送出（P1-T057）。
- 第四批（P1-T058～T060，2026-10-11）殘餘：
  - 資料區占用接手時，沿用的 providers 仍只在記憶體（選定模型、R6 紀錄不寫資料區）；同一路徑資料夾以記憶體為準、資料區舊授權捨棄（P1-T058）。
  - 資料夾身分比對與實際開啟之間非原子；身分不符被鎖住的資料夾只能移除再重選（P1-T058）。
  - 匯入暫存（`import.*`）仍只在記憶體（P1-T058 排除）。
  - 開發安裝 wrapper 寫死 node 路徑；擴充功能未設 `key`，換資料夾載入要重跑 `dev:install`（P1-T059）。
