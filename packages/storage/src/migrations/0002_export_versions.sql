-- 0002 不可變匯出版本、投遞紀錄、刪除素材紀錄（P1-T007；R3、D19）。
-- 不可變性在資料庫層用觸發器擋，不只靠 repository：
-- - export_versions 不能 UPDATE；同一 ID 永遠只能 INSERT 一次（含 INSERT OR REPLACE、REPLACE INTO、
--   以及刪除後再用同 ID 重建），靠 export_version_ledger 記下所有用過的 ID。
-- - 被投遞紀錄引用的匯出版本不能 DELETE（不依賴 PRAGMA foreign_keys）。
-- - 投遞紀錄只能指向存在的匯出版本，且不能改指向。
-- 表用 WITHOUT ROWID，避免以 rowid 衝突觸發 REPLACE 刪掉既有列。
-- 觸發器若被 DROP（DDL）資料庫層擋不住；export 模組開啟時會檢查觸發器都在。

CREATE TABLE export_versions (
  id TEXT PRIMARY KEY,
  resume_version_id TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  pdf_hash TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  CHECK (json_extract(data, '$.id') = id),
  CHECK (json_extract(data, '$.resumeVersionId') = resume_version_id),
  CHECK (json_extract(data, '$.pdfHash') = pdf_hash)
) STRICT, WITHOUT ROWID;
CREATE INDEX export_versions_resume ON export_versions (resume_version_id);
CREATE INDEX export_versions_pdf ON export_versions (pdf_hash);

-- 所有曾經建立過的匯出版本 ID（只增不減）。
CREATE TABLE export_version_ledger (
  id TEXT PRIMARY KEY
) STRICT, WITHOUT ROWID;

CREATE TRIGGER export_versions_insert_once
BEFORE INSERT ON export_versions
WHEN EXISTS (SELECT 1 FROM export_version_ledger WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'export_versions is immutable: id already used');
END;

CREATE TRIGGER export_versions_ledger_record
AFTER INSERT ON export_versions
BEGIN
  INSERT INTO export_version_ledger (id) VALUES (NEW.id);
END;

CREATE TRIGGER export_versions_no_update
BEFORE UPDATE ON export_versions
BEGIN
  SELECT RAISE(ABORT, 'export_versions is immutable');
END;

CREATE TRIGGER export_version_ledger_no_update
BEFORE UPDATE ON export_version_ledger
BEGIN
  SELECT RAISE(ABORT, 'export_version_ledger is append-only');
END;

CREATE TRIGGER export_version_ledger_no_delete
BEFORE DELETE ON export_version_ledger
BEGIN
  SELECT RAISE(ABORT, 'export_version_ledger is append-only');
END;

CREATE TABLE application_records (
  id TEXT PRIMARY KEY,
  export_version_id TEXT NOT NULL REFERENCES export_versions (id) ON DELETE RESTRICT,
  applied_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  CHECK (json_extract(data, '$.id') = id),
  CHECK (json_extract(data, '$.exportVersionId') = export_version_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX application_records_export ON application_records (export_version_id);

CREATE TRIGGER export_versions_no_delete_applied
BEFORE DELETE ON export_versions
WHEN EXISTS (SELECT 1 FROM application_records WHERE export_version_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'export version is referenced by an application record');
END;

CREATE TRIGGER application_records_insert_target
BEFORE INSERT ON application_records
WHEN NOT EXISTS (SELECT 1 FROM export_versions WHERE id = NEW.export_version_id)
BEGIN
  SELECT RAISE(ABORT, 'application record must point to an existing export version');
END;

-- 同 ID 只能新增一次：擋 INSERT OR REPLACE 換掉投遞紀錄指向的版本。修改狀態用 UPDATE。
CREATE TRIGGER application_records_insert_once
BEFORE INSERT ON application_records
WHEN EXISTS (SELECT 1 FROM application_records WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'application record id already exists');
END;

CREATE TRIGGER application_records_fixed_target
BEFORE UPDATE ON application_records
WHEN NEW.id IS NOT OLD.id OR NEW.export_version_id IS NOT OLD.export_version_id
BEGIN
  SELECT RAISE(ABORT, 'application record id and export version are fixed');
END;

-- 使用者刪除過的素材（D19）。投遞紀錄刪除後，若對應匯出版本含已刪素材的副本就一併刪除；
-- 也用來明示保留中的已投遞版本含哪些已刪素材。
CREATE TABLE deleted_materials (
  kind TEXT NOT NULL CHECK (kind IN ('claim', 'source_document', 'resume_version', 'job_snapshot')),
  material_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (kind, material_id)
) STRICT, WITHOUT ROWID;
