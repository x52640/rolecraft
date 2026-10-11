-- 0004 待刪 PDF 紀錄（P1-T052 對抗驗證修正；D19、擁有者裁定 #14）。
-- deleteMaterial 與刪投遞紀錄在「刪除資料列的同一交易」記下釋出的 PDF 雜湊；提交後刪檔，
-- 刪成功（或檔已不在、或仍被其他匯出版本引用）才移除紀錄。刪不掉的留著：
-- 啟動清掃不套寬限期立即重試，失敗就擋啟動，不會被當成一般孤兒只記錄。
CREATE TABLE pending_pdf_deletions (
  pdf_hash TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
