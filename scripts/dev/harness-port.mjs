/* global process */
// 開發用 harness（P1-T068）：用子程序模擬 chrome.runtime.connectNative 的 Port。
// 每次 connect 啟動一個 helper（同 Chrome：一條連線一個程序），argv 第一個參數是呼叫者 origin，
// stdin／stdout 走 Native Messaging 同一套 framing（apps/helper/src/bridge/framing.ts）。
import { spawn } from 'node:child_process';

import {
  encodeFrame,
  FrameDecoder,
  MAX_OUTGOING_BYTES,
} from '../../apps/helper/src/bridge/framing.ts';

/**
 * 建立一條連線。介面同 apps/extension/src/bridge/client.ts 的 NativePort。
 * spawnFn 可注入（測試用）；預設 node:child_process 的 spawn（不經 shell）。
 */
export function connectHelperPort({ entry, origin, env, spawnFn = spawn, onExit }) {
  const child = spawnFn(process.execPath, [entry, origin], {
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: false,
  });
  const messageListeners = [];
  const disconnectListeners = [];
  // helper → 瀏覽器單則上限 1 MB；超過或壞框就斷線（同瀏覽器行為）
  const decoder = new FrameDecoder(MAX_OUTGOING_BYTES);
  let closed = false;

  const close = (reason) => {
    if (closed) return;
    closed = true;
    lastError = reason;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    for (const cb of disconnectListeners) cb();
  };
  let lastError;

  child.stdout.on('data', (chunk) => {
    if (closed) return;
    const { messages, error } = decoder.decode(chunk);
    for (const message of messages) for (const cb of messageListeners) cb(message);
    if (error) close('本機輔助程式送出壞框');
  });
  child.on('error', () => close('無法啟動本機輔助程式'));
  child.on('exit', (code) => {
    onExit?.(code);
    close(`本機輔助程式已結束（結束碼 ${String(code)}）`);
  });
  child.stdin.on('error', () => close('本機輔助程式連線中斷'));

  return {
    port: {
      postMessage(message) {
        if (closed) throw new Error('連線已關閉');
        child.stdin.write(encodeFrame(message));
      },
      disconnect() {
        if (closed) return;
        closed = true;
        child.stdin.end();
        child.kill('SIGTERM');
      },
      onMessage: { addListener: (cb) => messageListeners.push(cb) },
      onDisconnect: { addListener: (cb) => disconnectListeners.push(cb) },
    },
    lastError: () => lastError,
    child,
  };
}
