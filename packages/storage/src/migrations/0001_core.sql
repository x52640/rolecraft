-- 0001 核心物件（P1-T006）。
-- 每張表的 data 欄存 contracts schema 驗證過的完整 JSON；其他欄位是查詢用的索引副本，
-- 由 repository 在同一次寫入時從 data 取出，不單獨修改。
-- 已套用的 migration 不得修改（runner 會比對 checksum）；變更一律新增下一號檔案。

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  folder_path TEXT NOT NULL,
  document_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_version INTEGER NOT NULL,
  authorization_status TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;
CREATE INDEX source_documents_folder ON source_documents (folder_path);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  review_status TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

-- 事實項引用了哪些來源文件（R2 來源變更時反查）。來源文件可能已刪除，故不設外鍵。
CREATE TABLE claim_sources (
  claim_id TEXT NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL,
  PRIMARY KEY (claim_id, source_document_id)
) STRICT;
CREATE INDEX claim_sources_document ON claim_sources (source_document_id);

CREATE TABLE project_evidence (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE TABLE job_snapshots (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE TABLE resume_versions (
  id TEXT PRIMARY KEY,
  job_snapshot_id TEXT NOT NULL REFERENCES job_snapshots (id),
  created_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;
CREATE INDEX resume_versions_job ON resume_versions (job_snapshot_id);

CREATE TABLE message_drafts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  job_snapshot_id TEXT REFERENCES job_snapshots (id),
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE TABLE provider_connections (
  provider TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

-- R6 每次執行的確認紀錄：只新增，不修改。
CREATE TABLE run_check_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;
CREATE INDEX run_check_records_provider ON run_check_records (provider);

CREATE TRIGGER run_check_records_no_update
BEFORE UPDATE ON run_check_records
BEGIN
  SELECT RAISE(ABORT, 'run_check_records is append-only');
END;

CREATE TABLE work_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  pause_reason TEXT
) STRICT;

CREATE TABLE work_units (
  job_id TEXT NOT NULL REFERENCES work_jobs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (job_id, position),
  UNIQUE (job_id, id)
) STRICT;
