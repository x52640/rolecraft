/* global process, console */
// 註冊／移除原型 host（使用者層級，macOS）。預設只印出將做的事；加 --yes 才真的寫檔。
//
//   node scripts/spikes/bridge/install.mjs --browser chrome --extension-id <32 字母 id> [--yes]
//   node scripts/spikes/bridge/install.mjs --browser chrome --uninstall [--yes]
//   （測試用）--target-dir <dir> 取代瀏覽器的 NativeMessagingHosts 目錄
//
// 寫入兩個檔：<dir>/com.rolecraft.bridge_spike.json（host manifest）與同名 .sh（啟動包裝）。
// 包裝檔寫死目前 node 的絕對路徑：從 Dock 啟動的瀏覽器 PATH 通常不含 Homebrew／nvm 的 node。
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const HOST_NAME = 'com.rolecraft.bridge_spike';

const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support');
/** macOS 使用者層級 host manifest 目錄。來源見 docs/adr/0003-bridge-transport.md。 */
export const BROWSER_DIRS = {
  chrome: path.join(SUPPORT, 'Google', 'Chrome', 'NativeMessagingHosts'),
  edge: path.join(SUPPORT, 'Microsoft Edge', 'NativeMessagingHosts'),
  arc: path.join(SUPPORT, 'Arc', 'User Data', 'NativeMessagingHosts'),
};

const HOST_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'host',
  'echo-host.mjs',
);

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** 產生要寫入的檔案內容（純函式，方便測試）。 */
export function buildFiles({ dir, extensionId, nodePath = process.execPath }) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('extension id 必須是 32 個 a–p 字母');
  const wrapper = path.join(dir, `${HOST_NAME}.sh`);
  const manifest = {
    name: HOST_NAME,
    description: 'RoleCraft P1-T013 bridge spike (echo only)',
    path: wrapper,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  return [
    {
      file: wrapper,
      mode: 0o755,
      content: `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(HOST_SCRIPT)} "$@"\n`,
    },
    {
      file: path.join(dir, `${HOST_NAME}.json`),
      mode: 0o644,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ];
}

export async function install({ dir, extensionId, apply }) {
  const files = buildFiles({ dir, extensionId });
  for (const { file, content, mode } of files) {
    console.log(`${apply ? '寫入' : '[dry-run] 將寫入'} ${file}\n${content}`);
    if (!apply) continue;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { mode });
    await chmod(file, mode);
  }
}

export async function uninstall({ dir, apply }) {
  for (const ext of ['json', 'sh']) {
    const file = path.join(dir, `${HOST_NAME}.${ext}`);
    console.log(`${apply ? '刪除' : '[dry-run] 將刪除'} ${file}`);
    if (apply) await rm(file, { force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      browser: { type: 'string' },
      'extension-id': { type: 'string' },
      'target-dir': { type: 'string' },
      uninstall: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const dir = values['target-dir'] ?? BROWSER_DIRS[values.browser ?? ''];
  if (!dir) throw new Error('需要 --browser chrome|edge|arc（或測試用 --target-dir）');
  if (values.uninstall) return uninstall({ dir, apply: values.yes });
  return install({ dir, extensionId: values['extension-id'] ?? '', apply: values.yes });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err.message ?? err));
    process.exit(1);
  });
}
