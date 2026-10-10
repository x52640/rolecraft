import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  T,
  claim,
  jobSnapshot,
  messageDraft,
  profile,
  projectEvidence,
  providerConnection,
  resumeVersion,
  runCheckRecord,
  sourceDocument,
  tempDatabase,
  workJob,
} from '../__fixtures__/entities.ts';
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

describe('simple repositories round-trip through SQLite', () => {
  it('Profile', () => {
    const p = profile();
    expect(repos.profiles.save(p)).toEqual(p);
    expect(repos.profiles.get(p.id)).toEqual(p);
    repos.profiles.save({ ...p, pdfParseConfirmed: true });
    expect(repos.profiles.get(p.id)?.pdfParseConfirmed).toBe(true);
    expect(repos.profiles.list()).toHaveLength(1);
    expect(repos.profiles.delete(p.id)).toBe(true);
    expect(repos.profiles.get(p.id)).toBeNull();
    expect(repos.profiles.delete(p.id)).toBe(false);
  });

  it('SourceDocument with folder lookup', () => {
    const a = sourceDocument();
    const b = sourceDocument({ folderPath: '/other', documentPath: '/other/plan.md' });
    repos.sourceDocuments.save(a);
    repos.sourceDocuments.save(b);
    repos.sourceDocuments.save({ ...a, contentVersion: 2, contentHash: 'b'.repeat(64) });
    expect(repos.sourceDocuments.get(a.id)?.contentVersion).toBe(2);
    expect(repos.sourceDocuments.listByFolder('/other')).toEqual([b]);
    expect(repos.sourceDocuments.list().map((d) => d.id)).toEqual([a.id, b.id]);
  });

  it('ProjectEvidence', () => {
    const e = projectEvidence(['c1', 'c2']);
    repos.projectEvidence.save(e);
    expect(repos.projectEvidence.get(e.id)).toEqual(e);
    expect(repos.projectEvidence.list()).toEqual([e]);
  });

  it('ProviderConnection is keyed by provider', () => {
    repos.providerConnections.save(providerConnection());
    repos.providerConnections.save(providerConnection({ login: 'failed' }));
    repos.providerConnections.save(providerConnection({ provider: 'codex' }));
    expect(repos.providerConnections.get('claude')?.login).toBe('failed');
    expect(repos.providerConnections.get('antigravity')).toBeNull();
    expect(repos.providerConnections.list()).toHaveLength(2);
  });
});

describe('ClaimRepository', () => {
  it('saves claims and finds them by cited source document', () => {
    const doc = sourceDocument();
    const other = sourceDocument();
    const c1 = claim(doc.id);
    const c2 = claim(other.id, { type: 'link', completionStatus: undefined, text: 'https://x' });
    delete c2.completionStatus;
    repos.claims.save(c1);
    repos.claims.save(c2);
    expect(repos.claims.get(c1.id)).toEqual(c1);
    expect(repos.claims.listBySourceDocument(doc.id)).toEqual([c1]);

    // 改依據後反查表跟著更新
    repos.claims.save({
      ...c1,
      basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: 'ok' } },
    });
    expect(repos.claims.listBySourceDocument(doc.id)).toEqual([]);

    t.db.prepare('DELETE FROM claims WHERE id = ?').run(c2.id); // 素材無公開 delete（D19）
    expect(repos.claims.listBySourceDocument(other.id)).toEqual([]);
  });

  it('rejects an invalid claim before writing anything', () => {
    const bad = { ...claim('d'), completionStatus: undefined };
    expect(() => repos.claims.save(bad)).toThrow();
    expect(repos.claims.list()).toEqual([]);
  });
});

describe('JobSnapshot / ResumeVersion / MessageDraft', () => {
  it('stores job-linked versions and enforces foreign keys', () => {
    const job = jobSnapshot();
    const rv = resumeVersion(job.id, 'claim-x');
    expect(() => repos.resumeVersions.save(rv)).toThrow(/FOREIGN KEY/);

    repos.jobSnapshots.save(job);
    repos.resumeVersions.save(rv);
    expect(repos.resumeVersions.get(rv.id)).toEqual(rv);
    expect(repos.resumeVersions.listByJobSnapshot(job.id)).toEqual([rv]);
    // 素材無公開 delete（D19，只走 deleteMaterial）；這裡直接用 SQL 驗外鍵
    const deleteJob = () => t.db.prepare('DELETE FROM job_snapshots WHERE id = ?').run(job.id);
    expect(deleteJob).toThrow(/FOREIGN KEY/);
    t.db.prepare('DELETE FROM resume_versions WHERE id = ?').run(rv.id);
    expect(deleteJob().changes).toBe(1);
  });

  it('keeps a manual-paste job snapshot with null URL', () => {
    const job = jobSnapshot({ platform: 'linkedin', captureMethod: 'manual_paste', url: null });
    repos.jobSnapshots.save(job);
    expect(repos.jobSnapshots.get(job.id)).toEqual(job);
  });

  it('message drafts with and without a job snapshot', () => {
    const job = jobSnapshot();
    repos.jobSnapshots.save(job);
    const linked = messageDraft(job.id);
    const free = messageDraft(null);
    repos.messageDrafts.save(linked);
    repos.messageDrafts.save(free);
    expect(repos.messageDrafts.list()).toEqual([linked, free]);
    expect(() => repos.messageDrafts.save(messageDraft('missing'))).toThrow(/FOREIGN KEY/);
  });

  it('rejects LinkedIn auto capture (contracts rule applies on write)', () => {
    expect(() =>
      repos.jobSnapshots.save(jobSnapshot({ platform: 'linkedin', captureMethod: 'auto' })),
    ).toThrow();
  });
});

describe('RunCheckRecordRepository', () => {
  it('is append-only', () => {
    const r1 = runCheckRecord();
    const r2 = runCheckRecord({ subscriptionOnly: 'unknown', executed: false });
    repos.runCheckRecords.append(r1);
    repos.runCheckRecords.append(r2);
    repos.runCheckRecords.append(runCheckRecord({ provider: 'codex' }));
    expect(repos.runCheckRecords.listByProvider('claude')).toEqual([r1, r2]);
    expect(repos.runCheckRecords.get(r1.id)).toEqual(r1);
    expect(() => repos.runCheckRecords.append({ ...r1, model: 'other' })).toThrow(/UNIQUE/);
    expect(() => t.db.prepare("UPDATE run_check_records SET provider = 'codex'").run()).toThrow(
      /append-only/,
    );
  });
});

describe('WorkJobRepository', () => {
  it('stores units in order and replaces them atomically', () => {
    const job = workJob();
    repos.workJobs.save(job);
    expect(repos.workJobs.get(job.id)).toEqual(job);

    const paused = { ...job, status: 'paused' as const, pauseReason: 'quota_exhausted' as const };
    repos.workJobs.save(paused);
    expect(repos.workJobs.get(job.id)).toEqual(paused);

    // 不合規（已暫停卻沒有原因）就整筆不寫
    expect(() => repos.workJobs.save({ ...job, status: 'paused', pauseReason: null })).toThrow();
    expect(repos.workJobs.get(job.id)).toEqual(paused);

    expect(repos.workJobs.list()).toEqual([paused]);
    expect(repos.workJobs.delete(job.id)).toBe(true);
    expect(t.db.prepare('SELECT count(*) AS n FROM work_units').get()).toEqual({ n: 0 });
  });
});

describe('integrity', () => {
  it('raises StorageError when stored data no longer matches the schema', () => {
    const p = profile();
    repos.profiles.save(p);
    t.db.prepare("UPDATE profiles SET data = json_set(data, '$.skills', 'oops')").run();
    expect(() => repos.profiles.get(p.id)).toThrow(StorageError);
  });

  it('persists across reopen of the same file', () => {
    const p = profile();
    repos.profiles.save(p);
    t.db.close();
    const reopened = openDatabase(t.file);
    expect(createRepositories(reopened.db).profiles.get(p.id)).toEqual(p);
    reopened.db.close();
  });
});
