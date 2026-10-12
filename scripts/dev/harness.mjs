/* global process, console */
// 開發用網頁測試入口（P1-T068）：編輯器跑在 http://127.0.0.1:<port>，經本機伺服器接到真的 helper。
// 只供開發者自己的機器、自測用；正式擴充功能與安裝流程不受影響。說明見 docs/dev-harness.md。
//
//   npm run dev:harness -- [--pdf <檔案>] [--folders <資料夾,...>] [--port N] [--data-dir <資料夾>]
//
// - helper 是子程序（scripts/dev/harness-helper.mjs → apps/helper/src/main.ts 的 main()），
//   origin 是每次啟動隨機產生的假擴充功能 origin，放進允許清單
// - 選取器不跳系統視窗，回傳 --pdf／--folders 指定的路徑；沒指定就等同使用者取消
// - 資料區預設 local-samples/harness-data/（gitignore）；字型唯讀使用 RoleCraft-dev 的字型資料夾
// - 會呼叫真實 Claude（用到訂閱額度）
import { randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { buildEditor } from '../../apps/editor/scripts/build.mjs';
import { createBridgeClient } from '../../apps/extension/src/bridge/client.ts';
import { HARNESS_HELPER_ENTRY, HARNESS_PICKS_ENV } from './harness-helper.mjs';
import { connectHelperPort } from './harness-port.mjs';
import { createHarnessHandler } from './harness-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_PORT = 5317;
export const DEFAULT_DATA_DIR = path.join(REPO_ROOT, 'local-samples', 'harness-data');
export const WEB_OUT_DIR = path.join(REPO_ROOT, 'local-samples', 'harness-web');

export function defaultFontsDir(home) {
  return path.join(home, 'Library', 'Application Support', 'RoleCraft-dev', 'fonts');
}

/** 隨機的假擴充功能 ID（32 個 a–p），只用於這次啟動的 origin 檢查。 */
export function randomExtensionId(bytes = randomBytes(32)) {
  return Array.from(bytes, (b) => String.fromCharCode(97 + (b & 15))).join('');
}

function existing(p, kind) {
  let stat;
  try {
    stat = statSync(p);
  } catch {
    throw new Error(`找不到${kind}：${p}`);
  }
  if (kind === '檔案' ? !stat.isFile() : !stat.isDirectory()) throw new Error(`不是${kind}：${p}`);
  return p;
}

/** 解析命令列；相對路徑以 cwd（npm 執行時是 INIT_CWD）為基準。不合法一律丟錯。 */
export function parseHarnessCli(argv, { cwd }) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      pdf: { type: 'string' },
      folders: { type: 'string' },
      port: { type: 'string' },
      'data-dir': { type: 'string' },
    },
  });
  const abs = (p) => path.resolve(cwd, p);
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port 必須是 0–65535 的整數：${values.port}`);
  }
  const pdf = values.pdf === undefined ? null : existing(abs(values.pdf), '檔案');
  const folders = (values.folders ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f !== '')
    .map((f) => existing(abs(f), '資料夾'));
  const dataDir = values['data-dir'] === undefined ? DEFAULT_DATA_DIR : abs(values['data-dir']);
  return { pdf, folders, port, dataDir };
}

/** helper 子程序的環境：沿用目前環境，加上允許清單、資料區、字型與預設選取結果。 */
export function helperEnv(base, { origin, dataDir, fontsDir, pdf, folders }) {
  return {
    ...base,
    ROLECRAFT_ALLOWED_ORIGINS: origin,
    ROLECRAFT_DATA_DIR: dataDir,
    ROLECRAFT_FONTS_DIR: fontsDir,
    [HARNESS_PICKS_ENV]: JSON.stringify({ pdf, folders }),
  };
}

/** 啟動 harness；回傳 { url, close }。build 可注入（測試不打包）。 */
export async function startHarness(options, deps = {}) {
  const { pdf, folders, port, dataDir } = options;
  const build = deps.build ?? buildEditor;
  const webRoot = deps.webRoot ?? WEB_OUT_DIR;
  const fontsDir = deps.fontsDir ?? defaultFontsDir(os.homedir());
  const entry = deps.helperEntry ?? HARNESS_HELPER_ENTRY;
  await build(webRoot);
  await mkdir(dataDir, { recursive: true });

  const extensionId = randomExtensionId();
  const origin = `chrome-extension://${extensionId}/`;
  const token = randomBytes(32).toString('hex');
  const env = helperEnv(deps.env ?? process.env, { origin, dataDir, fontsDir, pdf, folders });
  let current = null;
  const client = createBridgeClient({
    connect: () => {
      current = connectHelperPort({ entry, origin, env });
      return current.port;
    },
    lastError: () => current?.lastError(),
  });

  const server = createServer();
  const handler = createHarnessHandler({
    token,
    client,
    extensionId,
    webRoot,
    port: () => server.address().port,
  });
  server.on('request', handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actual = server.address().port;
  return {
    url: `http://127.0.0.1:${actual}/?token=${token}`,
    port: actual,
    token,
    close: () =>
      new Promise((resolve) => {
        client.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseHarnessCli(process.argv.slice(2), {
      cwd: process.env.INIT_CWD ?? process.cwd(),
    });
    const harness = await startHarness(options);
    console.log(`RoleCraft 開發用 harness 已啟動（只限本機、只供開發；會呼叫真實 Claude）`);
    console.log(`資料區：${options.dataDir}`);
    console.log(`PDF 選取器：${options.pdf ?? '（未指定，等同取消）'}`);
    console.log(`資料夾選取器：${options.folders.join(', ') || '（未指定，等同取消）'}`);
    console.log(`開啟：${harness.url}`);
    const stop = () => void harness.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    console.error(`harness 啟動失敗：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
