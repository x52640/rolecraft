# ADR-0006 contracts 暫行欄位決定

- 日期：2026-10-10
- 狀態：暫行（各項由後續 Task 定案時改 contracts，標 `contract_change`）
- 相關：P1-T001；`docs/specs/architecture.md` 核心資料物件

spec 只定語意，以下欄位細節由協調者暫定。改動要經對應 Task。

| # | 項目 | 暫行做法 | 定案 Task |
|---|---|---|---|
| 1 | ID、雜湊、時間格式 | **定案**：產生端 ID＝UUID v4 小寫、時間＝UTC 毫秒 `Z`（`toISOString`）、雜湊＝SHA-256 小寫 hex（contracts `CanonicalId`／`CanonicalTimestamp`／`Sha256Hash`）；讀取驗證維持寬鬆（非空字串、含時區 ISO）以相容外部輸入 | P1-T006 |
| 2 | 來源片段位置 `location` | 定案：字串 `tb2:<起始區塊序號>:<第幾份>/<共幾份>:<區塊指紋,…>`（P1-T003 對抗驗證後升版；舊 `tb1:<起始區塊序號>:<區塊指紋,…>` 仍可解析，視為第 0 份／共 1 份）。區塊以空行（只含空白類字元，含全形空白、零寬字元）或 ATX 標題行分隔，標題自成一塊；比對前 CRLF／CR 轉 LF、去開頭 BOM，其餘原樣；指紋＝SHA-256(JSON [章節標題路徑, 區塊原文])，片段跨區塊時依序列出各塊指紋；「份」＝文件中指紋序列完全相同的連續區塊，判定時份數不同即視為區塊有變，相同則取第幾份；只有一份時序號僅供顯示（重排不算變更），多於一份時序號也須相同。片段原文建立與比對前都去掉首尾空白類字元（含換行、全形空白、零寬字元）。由 domain `createSourceExcerpt` 產生；格式不符視為無法驗證（待複核）。schema 仍為非空字串 | P1-T003 |
| 3 | Claim 內容 `text` | 新增欄位（spec 表格漏列，事實項必有內容） | 定案 |
| 4 | Profile 欄位 | 欄位名→值對照；`pdfParseConfirmed` 布林 | P1-T020 |
| 5 | 投遞狀態、回覆意圖 | 自由文字 | P1-T028、P1-T029 |
| 6 | ProviderConnection／RunCheckRecord | 定案（P1-T010）：狀態 passed／failed／unknown，只有 passed 算成立。RunCheckRecord 加 `trigger`（run_start／queued_start／resume）、`items`（subscriptionLogin、environmentSanitized、cliConfig、executionMode，各為結果＋依據）、`removedEnvVarNames`（只記名稱不記值）、`executed`；schema 強制「任一項非 passed 則總結不得 passed、總結非 passed 則不得 executed」。D12：不設「額外用量」項 | P1-T010 |
| 7 | WorkJob／WorkUnit 狀態 | 定案：工作 running／paused／completed；單元 pending／completed；重試次數在單元；暫停原因 quota_exhausted／user_cancelled／retries_exhausted（暫時性錯誤重試用盡）／interrupted（執行中輔助程式關閉、重開後還原）；所有暫停只能由使用者續跑（D21）。進行中嘗試（attemptId）只在記憶體，不持久化 | P1-T005（已定案） |
| 8 | 橋接操作清單 | **定案（P1-T034、P1-T041）**：P1-T034 定信封（請求 id、錯誤碼 `not_implemented`／`helper_unavailable`／`timeout`、共用常數在 contracts）。P1-T041 一次定好編輯器頁面操作（`群組.動作`，群組＝helper `handlers/` 子目錄：jobs、import、sources、applications、providers、export、claims、resume、messages），helper 分派表一次註冊、未接服務回 `not_implemented`；請求指向物件一律 `OpaqueId`；content script 只能用兩個擷取操作；大回應（匯出 PDF）逐塊請求。語意見 bridge.md；各頁 Task 只實作自己目錄的 handler 與服務 | P1-T041（已定案）；各頁 Task 實作 handler |
| 9 | ResumeVersion | 段落 `origin`（generated／user_written）；修改理由與逐段接受狀態未建；原始履歷不是 ResumeVersion（由 Profile 表示） | P1-T024、P1-T025 |
| 10 | JobSnapshot | 手動貼上 URL 可為 null；平台無「其他」 | P1-T019 |
| 11 | ExportVersion | **定案（D19 部分）**：只存 `pdfHash`，PDF 由 storage 檔案區保存；新增選填 `sourceDocumentIds`（匯出當下引用事實項的依據來源文件，storage 新建時必填，供刪除來源文件時找出含其片段副本的版本）；不可變性由 storage 觸發器保證。D20（站內履歷外部版本）仍未建模 | P1-T007（D19 已定案）、P1-T027 |
| 12 | ProjectEvidence 包含的文件 | **定案（D23）**：schema 不變（`summary` 維持空字串，不由 AI 填）；專案包含哪些文件存 storage `project_documents`（來源文件 ID 為主鍵＝每份文件至多屬一個專案，刪專案連帶移除），不放進 contracts。事實項歸屬規則見 evidence-model「專案分組與事實項歸屬」 | P1-T063 |
| 13 | 投遞自介 ApplicationIntro | **定案（D25）**：新增實體（職缺快照 ID、文字、引用、產生時間、是否經使用者編輯），storage `application_intros` 以職缺快照 ID 為主鍵（每個快照只存最近一份，快照刪除時一併刪除）；字數上限與算法（code point）定義在 contracts `INTRO_MAX_CHARS`／`introLength`，編輯器與 helper 共用。最近一次產生狀態不持久化（只在 helper 記憶體）。橋接操作新增 `intro` 群組 | P1-T064 |
| 14 | 匯入結構化草稿 `ImportDraft.structured` | 相加可選欄位：認出 104 版面時才有（`layout: '104'`、personalInfo 標籤＋值、experiences 公司／職稱／起訖／current／描述、skills），每個值帶出處、找不到為 null；舊欄位不動，編輯器有它就用它預填 | P1-T066 |
