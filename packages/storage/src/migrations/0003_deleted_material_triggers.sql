-- 0003 素材刪除一律記入 deleted_materials（P1-T007 對抗驗證修正；D19 縱深防禦）。
-- 正常刪除只走 deleteMaterial；這組觸發器確保任何繞過它的 DELETE（直接 SQL 等）
-- 也會留下紀錄，讓已投遞版本照樣明示、刪投遞紀錄時照樣連帶清除，
-- 匯出也會拒絕再複製這些素材（未投遞副本由 sweepStorage 補刪）。
-- 重複刪除保留第一次的時間（INSERT OR IGNORE）。時間格式同 nowTimestamp：UTC、毫秒、Z 結尾。

CREATE TRIGGER claims_record_deleted
AFTER DELETE ON claims
BEGIN
  INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at)
  VALUES ('claim', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER source_documents_record_deleted
AFTER DELETE ON source_documents
BEGIN
  INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at)
  VALUES ('source_document', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER resume_versions_record_deleted
AFTER DELETE ON resume_versions
BEGIN
  INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at)
  VALUES ('resume_version', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER job_snapshots_record_deleted
AFTER DELETE ON job_snapshots
BEGIN
  INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at)
  VALUES ('job_snapshot', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
