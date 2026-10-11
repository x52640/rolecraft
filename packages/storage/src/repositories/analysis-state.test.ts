// P1-T060：分析流程狀態（分析工作計畫與計數、已分析版本、全域摘要各段）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { T, tempDatabase } from '../__fixtures__/entities.ts';
import { openDatabase } from '../database.ts';
import { StorageError } from '../errors.ts';
import { createRepositories, type Repositories } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let repos: Repositories;

beforeEach(() => {
  t = tempDatabase();
  repos = createRepositories(t.db);
});
afterEach(() => t.cleanup());

const job = {
  id: 'job-1',
  status: 'running' as const,
  units: [{ id: 'u1', status: 'pending' as const, provider: null, model: null, retryCount: 0 }],
  pauseReason: null,
};

describe('analysisState', () => {
  it('分析工作：計畫原樣讀回、計數累加、被擋原因可設可清；重開資料庫後仍在', () => {
    repos.workJobs.save(job);
    const plan = { jobId: 'job-1', globalSummary: [], units: [{ unitId: 'u1' }] };
    repos.analysisState.createJob({ jobId: 'job-1', startedAt: T, plan });
    repos.analysisState.addCounts('job-1', 2, 1);
    repos.analysisState.addCounts('job-1', 1, 0);
    repos.analysisState.setBlockReason('job-1', 'run_check_failed');
    t.db.close();
    const reopened = createRepositories(openDatabase(t.file).db);
    expect(reopened.analysisState.latestJob()).toEqual({
      jobId: 'job-1',
      startedAt: T,
      plan,
      claimsAdded: 3,
      claimsUpdated: 1,
      blockReason: 'run_check_failed',
    });
  });

  it('分析工作必須先有 work_jobs 列；計數只能累加到存在的工作', () => {
    expect(() =>
      repos.analysisState.createJob({ jobId: 'missing', startedAt: T, plan: {} }),
    ).toThrow();
    expect(() => repos.analysisState.addCounts('missing', 1, 0)).toThrow(StorageError);
  });

  it('最近一次＝最後建立的；已分析版本與摘要以文件為鍵覆蓋', () => {
    repos.workJobs.save(job);
    repos.workJobs.save({ ...job, id: 'job-2' });
    repos.analysisState.createJob({ jobId: 'job-1', startedAt: T, plan: {} });
    repos.analysisState.createJob({ jobId: 'job-2', startedAt: T, plan: {} });
    expect(repos.analysisState.latestJob()?.jobId).toBe('job-2');

    repos.analysisState.saveAnalyzed({
      sourceDocumentId: 'd1',
      contentVersion: 1,
      contentHash: 'h1',
    });
    repos.analysisState.saveAnalyzed({
      sourceDocumentId: 'd1',
      contentVersion: 2,
      contentHash: 'h2',
    });
    expect(repos.analysisState.listAnalyzed()).toEqual([
      { sourceDocumentId: 'd1', contentVersion: 2, contentHash: 'h2' },
    ]);
    repos.analysisState.saveSummary({ sourceDocumentId: 'd1', label: 'a.md', text: '舊' });
    repos.analysisState.saveSummary({ sourceDocumentId: 'd1', label: 'a.md', text: '新' });
    expect(repos.analysisState.listSummaries()).toEqual([
      { sourceDocumentId: 'd1', label: 'a.md', text: '新' },
    ]);
  });

  it('被擋原因只接受既定值', () => {
    repos.workJobs.save(job);
    repos.analysisState.createJob({ jobId: 'job-1', startedAt: T, plan: {} });
    expect(() =>
      repos.analysisState.setBlockReason('job-1', 'other' as 'run_check_failed'),
    ).toThrow();
  });
});
