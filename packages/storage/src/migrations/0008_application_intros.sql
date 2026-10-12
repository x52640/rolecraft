-- 0008 投遞自介（P1-T064，D25）：每個職缺快照只保存最近一份（主鍵＝職缺快照 ID）。
-- 只存文字、引用、產生時間、是否經使用者編輯；沒有任何送出紀錄（D7）。職缺快照刪除時一併刪除。
CREATE TABLE application_intros (
  job_snapshot_id TEXT PRIMARY KEY REFERENCES job_snapshots (id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;
