# ADR-0006 contracts 暫行欄位決定

- 日期：2026-10-10
- 狀態：暫行（各項由後續 Task 定案時改 contracts，標 `contract_change`）
- 相關：P1-T001；`docs/specs/architecture.md` 核心資料物件

spec 只定語意，以下欄位細節由協調者暫定。改動要經對應 Task。

| # | 項目 | 暫行做法 | 定案 Task |
|---|---|---|---|
| 1 | ID、雜湊、時間格式 | **定案**：產生端 ID＝UUID v4 小寫、時間＝UTC 毫秒 `Z`（`toISOString`）、雜湊＝SHA-256 小寫 hex（contracts `CanonicalId`／`CanonicalTimestamp`／`Sha256Hash`）；讀取驗證維持寬鬆（非空字串、含時區 ISO）以相容外部輸入 | P1-T006 |
| 2 | 來源片段位置 `location` | 定案：字串 `tb1:<起始區塊序號>:<區塊指紋,…>`。區塊以空行（只含空白類字元，含全形空白、零寬字元）或 ATX 標題行分隔，標題自成一塊；比對前 CRLF／CR 轉 LF、去開頭 BOM，其餘原樣；指紋＝SHA-256(JSON [章節標題路徑, 區塊原文])，片段跨區塊時依序列出各塊指紋；比對只看指紋與原文，序號僅供顯示。由 domain `createSourceExcerpt` 產生；格式不符視為無法驗證（待複核）。schema 仍為非空字串 | P1-T003 |
| 3 | Claim 內容 `text` | 新增欄位（spec 表格漏列，事實項必有內容） | 定案 |
| 4 | Profile 欄位 | 欄位名→值對照；`pdfParseConfirmed` 布林 | P1-T020 |
| 5 | 投遞狀態、回覆意圖 | 自由文字 | P1-T028、P1-T029 |
| 6 | ProviderConnection／RunCheckRecord | 定案（P1-T010）：狀態 passed／failed／unknown，只有 passed 算成立。RunCheckRecord 加 `trigger`（run_start／queued_start／resume）、`items`（subscriptionLogin、environmentSanitized、cliConfig、executionMode，各為結果＋依據）、`removedEnvVarNames`（只記名稱不記值）、`executed`；schema 強制「任一項非 passed 則總結不得 passed、總結非 passed 則不得 executed」。D12：不設「額外用量」項 | P1-T010 |
| 7 | WorkJob／WorkUnit 狀態 | 定案：工作 running／paused／completed；單元 pending／completed；重試次數在單元；暫停原因 quota_exhausted／user_cancelled／retries_exhausted（暫時性錯誤重試用盡）／interrupted（執行中輔助程式關閉、重開後還原）；所有暫停只能由使用者續跑（D21）。進行中嘗試（attemptId）只在記憶體，不持久化 | P1-T005（已定案） |
| 8 | 橋接操作清單 | 只有 bridge.md R7 舉的 4 個；編輯器需要的操作由各 Task 先改 bridge.md 再加（additive） | P1-T014 起逐項 |
| 9 | ResumeVersion | 段落 `origin`（generated／user_written）；修改理由與逐段接受狀態未建；原始履歷不是 ResumeVersion（由 Profile 表示） | P1-T024、P1-T025 |
| 10 | JobSnapshot | 手動貼上 URL 可為 null；平台無「其他」 | P1-T019 |
| 11 | ExportVersion | 只存 `pdfHash`，檔案由 storage 保存；D19／D20 未建模 | P1-T007、P1-T027 |
