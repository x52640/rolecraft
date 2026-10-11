-- 0006 分析流程狀態（P1-T060，F05、R2、R8、R9）：分析工作的計畫與計數、各文件上次分析完成的版本、
-- 全域履歷摘要的各文件段落。工作本身與單元狀態仍在 work_jobs／work_units。

-- 分析工作：計畫（單元片段、預算、計畫當下的全域摘要；續跑時沿用）與本次新增／更新的事實項數。
-- block_reason：最近一次執行被擋的原因（R6 不通過、供應商不可重試錯誤、來源變了要重新規劃），續跑時清掉。
CREATE TABLE analysis_jobs (
  job_id TEXT PRIMARY KEY REFERENCES work_jobs (id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (json_valid(plan)),
  claims_added INTEGER NOT NULL DEFAULT 0 CHECK (claims_added >= 0),
  claims_updated INTEGER NOT NULL DEFAULT 0 CHECK (claims_updated >= 0),
  block_reason TEXT CHECK (block_reason IN ('run_check_failed', 'provider_error', 'sources_changed'))
) STRICT;

-- 每份來源文件上次分析完成時的版本（增量判斷用，R2）。
CREATE TABLE analyzed_documents (
  source_document_id TEXT PRIMARY KEY,
  content_version INTEGER NOT NULL CHECK (content_version >= 1),
  content_hash TEXT NOT NULL
) STRICT;

-- 全域履歷摘要：每份文件一段（模型整理，只是資料，不帶確認狀態）。
CREATE TABLE document_summaries (
  source_document_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  text TEXT NOT NULL
) STRICT;
