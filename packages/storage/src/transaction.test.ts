import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { transaction } from './transaction.ts';

describe('transaction（codex review P1-T006）', () => {
  it('拒絕 async 函式並回滾已執行的寫入', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (v INTEGER)');
    expect(() =>
      transaction(db, async () => {
        db.exec('INSERT INTO t VALUES (1)');
        await Promise.resolve();
      }),
    ).toThrow(TypeError);
    expect(db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 0 });
  });
});
