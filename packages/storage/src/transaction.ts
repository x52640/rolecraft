import type { DatabaseSync } from 'node:sqlite';

let savepointCounter = 0;

/**
 * 在交易內執行 fn；fn 拋錯就回滾。可巢狀（內層用 SAVEPOINT），
 * 讓 repository 的多表寫入與呼叫端更大的交易都能共用。
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const name = `rc_sp_${++savepointCounter}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  }
}
