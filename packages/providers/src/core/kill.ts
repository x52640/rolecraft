import type { ChildProcess } from 'node:child_process';

/**
 * 子程序群組終止。launcher 一律以 detached 建立子程序（POSIX 上即 setsid，自成一個群組），
 * 終止時對 -pid 送訊號，連 CLI 開出的工具／hook 孫程序一起處理。
 * 沒有 pid（測試假程序、啟動失敗）或 Windows 不支援群組訊號時退回只對本體送。
 */

const REKILL_INTERVAL_MS = 25;
const REKILL_LIMIT = 80;

/** 對 -pid 送訊號；群組不存在或不支援回 false。 */
function signalGroupPid(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** 對整個程序群組送訊號（失敗時退回只送本體）。 */
export function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (process.platform === 'win32' || typeof pid !== 'number' || !signalGroupPid(pid, signal)) {
    child.kill(signal);
  }
}

/**
 * 以 SIGKILL 終止整個程序群組。
 * 送出當下若有程序正在 fork，新程序可能漏接訊號，所以之後每 25ms 再送一次，直到群組消失（最多約 2 秒）。
 */
export function killProcessGroup(child: ChildProcess): void {
  const pid = child.pid;
  if (process.platform === 'win32' || typeof pid !== 'number' || !signalGroupPid(pid, 'SIGKILL')) {
    child.kill('SIGKILL');
    return;
  }
  let rounds = 0;
  const timer = setInterval(() => {
    rounds += 1;
    if (!signalGroupPid(pid, 'SIGKILL') || rounds >= REKILL_LIMIT) clearInterval(timer);
  }, REKILL_INTERVAL_MS);
  timer.unref();
}
