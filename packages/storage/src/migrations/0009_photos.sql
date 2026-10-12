-- 0009 目前照片與照片素材（P1-T082；resume-output「照片」、R3、D19、D28）。
-- 照片存在資料庫，不放檔案儲存區（孤兒清掃不會碰到）。同時最多一張：slot 固定為 1 且唯一。
-- 素材身分是照片 ID（每次加入、更換都配發新的）；雜湊只記錄內容，不當身分（W12）。

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (slot = 1),
  format TEXT NOT NULL CHECK (format = 'jpeg'),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 1200),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 1200),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  content BLOB NOT NULL CHECK (length(content) > 0),
  created_at TEXT NOT NULL
) STRICT;

-- 同一照片 ID 的內容不可改（匯出版本記的雜湊要對得上）；更換一律刪舊加新。
CREATE TRIGGER photos_no_update
BEFORE UPDATE ON photos
BEGIN
  SELECT RAISE(ABORT, 'photos are immutable: replace by delete and insert');
END;

-- deleted_materials 的 kind 加上 'photo'：SQLite 不能改 CHECK，只能重建表。
-- 先拿掉 0003 引用這張表的觸發器，重建後原樣建回（避免改名時觸發器指向已刪的表）。
DROP TRIGGER claims_record_deleted;
DROP TRIGGER source_documents_record_deleted;
DROP TRIGGER resume_versions_record_deleted;
DROP TRIGGER job_snapshots_record_deleted;

CREATE TABLE deleted_materials_0009 (
  kind TEXT NOT NULL CHECK (
    kind IN ('claim', 'source_document', 'resume_version', 'job_snapshot', 'photo')
  ),
  material_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (kind, material_id)
) STRICT, WITHOUT ROWID;
INSERT INTO deleted_materials_0009 (kind, material_id, deleted_at)
  SELECT kind, material_id, deleted_at FROM deleted_materials;
DROP TABLE deleted_materials;
ALTER TABLE deleted_materials_0009 RENAME TO deleted_materials;

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

-- 已刪除的照片 ID 不能再加入（否則已刪照片的匯出又變成可建立）。
CREATE TRIGGER photos_no_reuse_deleted_id
BEFORE INSERT ON photos
WHEN EXISTS (SELECT 1 FROM deleted_materials WHERE kind = 'photo' AND material_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'photo id was deleted and cannot be reused');
END;

-- 照片被刪一律記入已刪素材（含繞過 removePhoto／replacePhoto 的直接 SQL；D19 縱深防禦）。
CREATE TRIGGER photos_record_deleted
AFTER DELETE ON photos
BEGIN
  INSERT OR IGNORE INTO deleted_materials (kind, material_id, deleted_at)
  VALUES ('photo', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

-- 匯出版本相加照片 ID 與雜湊欄（R3）：由 data 的 photo 欄產生，與 JSON 不可能不一致。
ALTER TABLE export_versions ADD COLUMN photo_id TEXT
  GENERATED ALWAYS AS (json_extract(data, '$.photo.photoId')) VIRTUAL;
ALTER TABLE export_versions ADD COLUMN photo_sha256 TEXT
  GENERATED ALWAYS AS (json_extract(data, '$.photo.sha256')) VIRTUAL;
CREATE INDEX export_versions_photo ON export_versions (photo_id);

-- 已刪照片的匯出在資料庫層也擋（與刪照片的交易互斥，補上 create 檢查到寫入之間的空窗）。
CREATE TRIGGER export_versions_no_deleted_photo
BEFORE INSERT ON export_versions
WHEN json_extract(NEW.data, '$.photo.photoId') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM deleted_materials
    WHERE kind = 'photo' AND material_id = json_extract(NEW.data, '$.photo.photoId')
  )
BEGIN
  SELECT RAISE(ABORT, 'export version holds a deleted photo');
END;
