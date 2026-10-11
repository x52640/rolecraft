// pauseInterruptedJobs 的原子性（P1-T048）：列出與存檔在同一交易，中途失敗時全部回滾，
// 不會留下「部分已暫停、部分仍以舊快照覆寫」的狀態。
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { pauseInterruptedJobs } from './assemble.ts';

const unit = (id: string) =>
  ({ id, status: 'pending', provider: null, model: null, retryCount: 0 }) as const;

describe('pauseInterruptedJobs 原子性', () => {
  it('其中一筆存檔失敗：整批回滾，沒有任何工作被改', () => {
    const { db } = openDatabase(':memory:');
    const jobs = createRepositories(db).workJobs;
    jobs.save({ id: 'w-1', status: 'running', units: [unit('u-1')], pauseReason: null });
    jobs.save({ id: 'w-2', status: 'running', units: [unit('u-2')], pauseReason: null });
    db.exec(
      "CREATE TEMP TRIGGER block_w2 BEFORE UPDATE ON work_jobs WHEN OLD.id = 'w-2' BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    );
    expect(() => pauseInterruptedJobs(db)).toThrow(/blocked/u);
    expect(jobs.get('w-1')).toMatchObject({ status: 'running', pauseReason: null });
    expect(jobs.get('w-2')).toMatchObject({ status: 'running', pauseReason: null });
    db.close();
  });
});
