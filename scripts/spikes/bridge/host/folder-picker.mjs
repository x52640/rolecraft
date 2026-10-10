// 資料夾選取原型：由 host 開 macOS 原生選取器（AppleScript `choose folder`）。
// 指令與參數全部寫死，沒有任何來自訊息的輸入；用 execFile（不經 shell）。
// 回給瀏覽器的只有不透明 ID 與資料夾名稱，完整路徑留在 host 端（R7：介面不傳路徑）。
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

const SCRIPT = [
  'set picked to choose folder with prompt "選擇要匯入的專案資料夾（可複選）" with multiple selections allowed',
  'set out to ""',
  'repeat with f in picked',
  'set out to out & POSIX path of f & linefeed',
  'end repeat',
  'return out',
].join('\n');

/** 執行系統選取器，回傳使用者選的絕對路徑；取消時回傳空陣列。 */
export function runMacFolderDialog() {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', SCRIPT], { timeout: 5 * 60 * 1000 }, (err, stdout) => {
      if (err) {
        // -128 = 使用者按取消
        if (String(err.message).includes('-128')) return resolve([]);
        return reject(err);
      }
      resolve(
        String(stdout)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      );
    });
  });
}

/**
 * @param {() => Promise<string[]>} dialog 可替換（測試用 stub）
 * @param {Map<string, string>} registry host 端保存的 ID → 實際路徑
 */
export async function pickFolders(dialog, registry) {
  const chosen = await dialog();
  const folders = [];
  for (const picked of chosen) {
    const real = await realpath(picked);
    const id = randomUUID();
    registry.set(id, real);
    folders.push({
      id,
      name: path.basename(real),
      resolvedFromLink: real !== path.resolve(picked),
    });
  }
  return { cancelled: chosen.length === 0, folders };
}
