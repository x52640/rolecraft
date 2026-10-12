// P1-T064：投遞自介（每個職缺快照只保存最近一份；快照刪除時一併刪除）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { T, jobSnapshot, tempDatabase } from '../__fixtures__/entities.ts';
import { createRepositories, type Repositories } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let repos: Repositories;
let jobId: string;

beforeEach(() => {
  t = tempDatabase();
  repos = createRepositories(t.db);
  jobId = repos.jobSnapshots.save(jobSnapshot()).id;
});
afterEach(() => t.cleanup());

const intro = (text: string) => ({
  jobSnapshotId: jobId,
  text,
  citations: [{ claimId: 'c1', statedCompletion: 'in_progress' as const }],
  generatedAt: T,
  userEdited: false,
});

describe('applicationIntros', () => {
  it('同一職缺快照只保存最近一份；查不到回 null', () => {
    expect(repos.applicationIntros.get(jobId)).toBeNull();
    repos.applicationIntros.save(intro('第一版'));
    repos.applicationIntros.save({ ...intro('第二版'), userEdited: true });
    expect(repos.applicationIntros.get(jobId)).toMatchObject({ text: '第二版', userEdited: true });
    const count = t.db.prepare('SELECT COUNT(*) AS n FROM application_intros').get();
    expect(count?.n).toBe(1);
  });

  it('職缺快照必須存在；快照刪除時一併刪除', () => {
    expect(() =>
      repos.applicationIntros.save({ ...intro('x'), jobSnapshotId: 'missing' }),
    ).toThrow();
    repos.applicationIntros.save(intro('x'));
    t.db.prepare('DELETE FROM job_snapshots WHERE id = ?').run(jobId);
    expect(repos.applicationIntros.get(jobId)).toBeNull();
  });

  it('不符 schema 的內容不寫入', () => {
    expect(() =>
      repos.applicationIntros.save({ ...intro('x'), generatedAt: 'yesterday' }),
    ).toThrow();
  });
});
