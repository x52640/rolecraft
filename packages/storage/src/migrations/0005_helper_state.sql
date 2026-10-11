-- 0005 helper 狀態持久化（P1-T058）：授權資料夾與其授權變更、讀檔紀錄（R4）、
-- 選定的模型（存模型別名，不存每次啟動重新配發的候選 ID）、Claude CLI 版本驗證紀錄（D22）。

-- 授權資料夾：不透明 ID 跨重啟不變；絕對路徑只留在 helper（R7）。
-- real_path、root_dev、root_ino：加入時的實際路徑與 (dev, ino)；重啟後第一次開啟不一致
-- （原路徑換成符號連結或別的資料夾）就整個資料夾不可讀、文件降為待確認。
CREATE TABLE authorized_folders (
  id TEXT PRIMARY KEY,
  absolute_path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  authorized_at TEXT NOT NULL,
  real_path TEXT NOT NULL,
  root_dev TEXT NOT NULL,
  root_ino TEXT NOT NULL
) STRICT;

-- 使用者在預覽中確認或撤銷過的文件；待確認的候選不存（下次預覽重新列出）。
CREATE TABLE authorized_folder_items (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES authorized_folders (id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  status TEXT NOT NULL CHECK (status IN ('authorized', 'revoked')),
  UNIQUE (folder_id, rel_path)
) STRICT;

-- R4 讀檔紀錄（路徑、時間、雜湊供驗收）：只新增，不修改、不刪除；資料夾移除後紀錄仍保留。
CREATE TABLE source_read_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  read_at TEXT NOT NULL,
  content_hash TEXT NOT NULL
) STRICT;

CREATE TRIGGER source_read_log_no_update
BEFORE UPDATE ON source_read_log
BEGIN
  SELECT RAISE(ABORT, 'source_read_log is append-only');
END;

CREATE TRIGGER source_read_log_no_delete
BEFORE DELETE ON source_read_log
BEGIN
  SELECT RAISE(ABORT, 'source_read_log is append-only');
END;

-- 選定的模型（每個服務一筆）；重啟時對回目前配發的候選。
CREATE TABLE provider_selections (
  provider TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  selected_at TEXT NOT NULL
) STRICT;

-- Claude CLI 版本驗證紀錄（ClaudeVersionStore）：依新增順序，同一版本以最後一筆為準；不修改。
CREATE TABLE claude_version_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE TRIGGER claude_version_records_no_update
BEFORE UPDATE ON claude_version_records
BEGIN
  SELECT RAISE(ABORT, 'claude_version_records is append-only');
END;
