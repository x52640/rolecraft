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

  it('拒絕會失敗的 async 函式時，原 Promise 的失敗不成為 unhandled rejection（codex 補審 79ac0cd）', async () => {
    const db = new DatabaseSync(':memory:');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(() =>
        transaction(db, async () => {
          await Promise.resolve();
          throw new Error('original');
        }),
      ).toThrow(TypeError);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
