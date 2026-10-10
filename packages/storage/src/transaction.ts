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
    // async 函式回傳 Promise 時，後續的失敗無法回滾（codex review P1-T006）
    if (result !== null && typeof (result as { then?: unknown })?.then === 'function') {
      // 先接住原 Promise 的失敗，否則它變成 unhandled rejection 讓程序崩潰（codex 補審 79ac0cd）
      (result as PromiseLike<unknown>).then(undefined, () => {});
      throw new TypeError('transaction 不接受 async 函式');
    }
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  }
}
