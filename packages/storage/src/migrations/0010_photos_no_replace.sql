-- 0010 擋 REPLACE 覆寫照片（P1-T082 對抗審查＋codex review；D19）。
-- INSERT OR REPLACE 在 recursive_triggers 關閉時，衝突列被刪不會觸發 DELETE 觸發器，
-- 也不走 UPDATE：舊照片沒記入已刪素材、含它的未投遞匯出版本不會刪，同 ID 還能換內容。
-- 已有照片時一律拒絕新增；更換只能走 replacePhoto（同一交易先刪舊、再加新）。
CREATE TRIGGER photos_insert_only_when_empty
BEFORE INSERT ON photos
WHEN EXISTS (SELECT 1 FROM photos)
BEGIN
  SELECT RAISE(ABORT, 'a photo already exists: delete it first (D19)');
END;
