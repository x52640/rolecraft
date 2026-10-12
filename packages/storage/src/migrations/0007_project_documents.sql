-- 0007 專案包含哪些文件（P1-T063，D23）：使用者確認分組後記下，重新分析時新事實項依此歸入專案。
-- 每份來源文件至多屬一個專案（主鍵）。來源文件可能已刪除，故不對 source_documents 設外鍵；
-- 專案刪除時一併移除（文件不再屬任何專案）。
CREATE TABLE project_documents (
  source_document_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_evidence (id) ON DELETE CASCADE
) STRICT;
CREATE INDEX project_documents_project ON project_documents (project_id);
