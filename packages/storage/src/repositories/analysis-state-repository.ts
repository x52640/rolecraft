import type { DatabaseSync } from 'node:sqlite';

import { AnalysisBlockReason } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';

/**
 * 分析流程狀態（P1-T060）：分析工作的計畫與計數、各文件上次分析完成的版本、全域摘要各段。
 * 計畫是 pipeline 的純資料（storage 不依賴 pipeline）：存成 JSON，讀出時回 unknown，由呼叫端驗證。
 * 工作本身（狀態、單元）在 work_jobs，必須先存工作再建這裡的列。
 */
export interface AnalysisJobRow {
  readonly jobId: string;
  readonly startedAt: string;
  readonly plan: unknown;
  readonly claimsAdded: number;
  readonly claimsUpdated: number;
  readonly blockReason: AnalysisBlockReason | null;
}

export interface AnalyzedDocumentRow {
  readonly sourceDocumentId: string;
  readonly contentVersion: number;
  readonly contentHash: string;
}

export interface DocumentSummaryRow {
  readonly sourceDocumentId: string;
  readonly label: string;
  readonly text: string;
}

export interface AnalysisStateRepository {
  createJob(job: { jobId: string; startedAt: string; plan: unknown }): void;
  getJob(jobId: string): AnalysisJobRow | null;
  /** 最近建立的分析工作 */
  latestJob(): AnalysisJobRow | null;
  /** 累加本次工作新增／更新的事實項數 */
  addCounts(jobId: string, added: number, updated: number): void;
  setBlockReason(jobId: string, reason: AnalysisBlockReason | null): void;
  listAnalyzed(): AnalyzedDocumentRow[];
  saveAnalyzed(row: AnalyzedDocumentRow): void;
  listSummaries(): DocumentSummaryRow[];
  saveSummary(row: DocumentSummaryRow): void;
}

function text(row: Record<string, unknown>, name: string, where: string): string {
  const value = row[name];
  if (typeof value !== 'string') throw new StorageError(`${where}：${name} 欄不合法`);
  return value;
}

function count(row: Record<string, unknown>, name: string, where: string): number {
  const value = row[name];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new StorageError(`${where}：${name} 欄不合法`);
  }
  return value;
}

function toJob(row: Record<string, unknown>): AnalysisJobRow {
  const jobId = text(row, 'job_id', 'analysis_jobs');
  const where = `analysis_jobs[${jobId}]`;
  let plan: unknown;
  try {
    plan = JSON.parse(text(row, 'plan', where));
  } catch (error) {
    throw new StorageError(`${where}：plan 欄不是 JSON`, { cause: error });
  }
  const reason = row['block_reason'];
  const parsedReason = reason === null ? null : AnalysisBlockReason.safeParse(reason);
  if (parsedReason !== null && !parsedReason.success) {
    throw new StorageError(`${where}：block_reason 欄不合法`);
  }
  return {
    jobId,
    startedAt: text(row, 'started_at', where),
    plan,
    claimsAdded: count(row, 'claims_added', where),
    claimsUpdated: count(row, 'claims_updated', where),
    blockReason: parsedReason === null ? null : parsedReason.data,
  };
}

const JOB_COLUMNS = 'job_id, started_at, plan, claims_added, claims_updated, block_reason';

export function createAnalysisStateRepository(db: DatabaseSync): AnalysisStateRepository {
  return {
    createJob({ jobId, startedAt, plan }) {
      db.prepare('INSERT INTO analysis_jobs (job_id, started_at, plan) VALUES (?, ?, ?)').run(
        jobId,
        startedAt,
        JSON.stringify(plan),
      );
    },
    getJob(jobId) {
      const row = db
        .prepare(`SELECT ${JOB_COLUMNS} FROM analysis_jobs WHERE job_id = ?`)
        .get(jobId);
      return row ? toJob(row) : null;
    },
    latestJob() {
      const row = db
        .prepare(`SELECT ${JOB_COLUMNS} FROM analysis_jobs ORDER BY rowid DESC LIMIT 1`)
        .get();
      return row ? toJob(row) : null;
    },
    addCounts(jobId, added, updated) {
      const changes = db
        .prepare(
          `UPDATE analysis_jobs SET claims_added = claims_added + ?, claims_updated = claims_updated + ?
           WHERE job_id = ?`,
        )
        .run(added, updated, jobId).changes;
      if (changes === 0) throw new StorageError(`analysis_jobs[${jobId}]：不存在`);
    },
    setBlockReason(jobId, reason) {
      db.prepare('UPDATE analysis_jobs SET block_reason = ? WHERE job_id = ?').run(reason, jobId);
    },
    listAnalyzed() {
      return db
        .prepare(
          'SELECT source_document_id, content_version, content_hash FROM analyzed_documents ORDER BY rowid',
        )
        .all()
        .map((row) => ({
          sourceDocumentId: text(row, 'source_document_id', 'analyzed_documents'),
          contentVersion: count(row, 'content_version', 'analyzed_documents'),
          contentHash: text(row, 'content_hash', 'analyzed_documents'),
        }));
    },
    saveAnalyzed(row) {
      db.prepare(
        `INSERT INTO analyzed_documents (source_document_id, content_version, content_hash) VALUES (?, ?, ?)
         ON CONFLICT (source_document_id) DO UPDATE SET
           content_version = excluded.content_version, content_hash = excluded.content_hash`,
      ).run(row.sourceDocumentId, row.contentVersion, row.contentHash);
    },
    listSummaries() {
      return db
        .prepare('SELECT source_document_id, label, text FROM document_summaries ORDER BY rowid')
        .all()
        .map((row) => ({
          sourceDocumentId: text(row, 'source_document_id', 'document_summaries'),
          label: text(row, 'label', 'document_summaries'),
          text: text(row, 'text', 'document_summaries'),
        }));
    },
    saveSummary(row) {
      db.prepare(
        `INSERT INTO document_summaries (source_document_id, label, text) VALUES (?, ?, ?)
         ON CONFLICT (source_document_id) DO UPDATE SET label = excluded.label, text = excluded.text`,
      ).run(row.sourceDocumentId, row.label, row.text);
    },
  };
}
