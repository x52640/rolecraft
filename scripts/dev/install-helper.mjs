/* global process, console */
// 開發用安裝（P1-T059）：把 repo 裡的真 helper 註冊給瀏覽器，準備資料區與字型。
// 正式安裝（內建 Node、固定擴充功能 ID）是 P1-T031，不在這裡。
//
//   npm run dev:install -- --extension-id <32 個 a–p 字元> [--browser chrome|edge|arc] [--data-dir <絕對路徑>] [--yes]
//   npm run dev:uninstall -- [--browser chrome|edge|arc] [--yes]
//
// 沒有 --yes 只印出會做的事，不寫任何檔、不下載字型。
// 寫入（瀏覽器的 NativeMessagingHosts 目錄，位置見 ADR-0003）：
//   com.rolecraft.helper.json（host manifest）＋ com.rolecraft.helper.sh（啟動包裝）
// 包裝檔寫死 node 與 apps/helper/src/main.ts 的絕對路徑（從 Dock 啟動的瀏覽器 PATH 通常沒有 node），
// 並設 ROLECRAFT_ALLOWED_ORIGINS、ROLECRAFT_DATA_DIR、ROLECRAFT_FONTS_DIR。
// --uninstall 只刪本腳本寫的兩個檔（認標記），不刪資料區。
import { spawn } from 'node:child_process';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { BUNDLED_FONT_FILES } from '../../packages/pdf-export/src/fonts/manifest.ts';

/** 與 contracts 的 NATIVE_HOST_NAME 相同（擴充功能用這個名字 connectNative）。 */
export const HOST_NAME = 'com.rolecraft.helper';
/** 認得「這是開發安裝寫的」的標記；不是這個標記的檔一律不覆寫、不刪除。 */
export const DEV_DESCRIPTION = 'RoleCraft helper (dev install, P1-T059)';
export const WRAPPER_MARKER = '# rolecraft-dev-install (P1-T059)';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HELPER_ENTRY = path.join(REPO_ROOT, 'apps', 'helper', 'src', 'main.ts');
const FETCH_FONTS = path.join(REPO_ROOT, 'packages', 'pdf-export', 'scripts', 'fetch-fonts.mjs');

const EXTENSION_ID = /^[a-p]{32}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** macOS 使用者層級 host manifest 目錄（ADR-0003）。home 可注入，測試不碰真的家目錄。 */
export function browserHostDirs(home) {
  const support = path.join(home, 'Library', 'Application Support');
  return {
    chrome: path.join(support, 'Google', 'Chrome', 'NativeMessagingHosts'),
    edge: path.join(support, 'Microsoft Edge', 'NativeMessagingHosts'),
    arc: path.join(support, 'Arc', 'User Data', 'NativeMessagingHosts'),
  };
}

export function defaultDataDir(home) {
  return path.join(home, 'Library', 'Application Support', 'RoleCraft-dev');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function requireAbsolute(value, name) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || CONTROL_CHARS.test(value)) {
    throw new Error(`${name} 必須是絕對路徑（不可含控制字元）：${String(value)}`);
  }
  return path.normalize(value);
}

/** 解析命令列；不合法一律丟錯（未知參數、ID 格式、相對路徑）。 */
export function parseCli(argv, { home }) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      browser: { type: 'string', default: 'chrome' },
      'extension-id': { type: 'string' },
      'data-dir': { type: 'string' },
      uninstall: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const hostDirs = browserHostDirs(requireAbsolute(home, '家目錄'));
  if (!Object.hasOwn(hostDirs, values.browser)) {
    throw new Error(`--browser 只能是 chrome、edge 或 arc：${values.browser}`);
  }
  const base = { browser: values.browser, hostDir: hostDirs[values.browser], apply: values.yes };
  if (values.uninstall) return { ...base, action: 'uninstall' };
  const extensionId = values['extension-id'];
  if (extensionId === undefined) {
    throw new Error('需要 --extension-id（擴充功能頁「載入未封裝項目」後顯示的 ID）');
  }
  if (!EXTENSION_ID.test(extensionId)) {
    throw new Error('--extension-id 必須是 32 個 a–p 小寫字母');
  }
  const dataDir = requireAbsolute(values['data-dir'] ?? defaultDataDir(home), '--data-dir');
  return { ...base, action: 'install', extensionId, dataDir };
}

/** 要寫入的兩個檔（純函式）。 */
export function buildFiles({ hostDir, extensionId, dataDir, nodePath, helperEntry }) {
  const wrapper = path.join(hostDir, `${HOST_NAME}.sh`);
  const env = {
    ROLECRAFT_ALLOWED_ORIGINS: `chrome-extension://${extensionId}/`,
    ROLECRAFT_DATA_DIR: dataDir,
    ROLECRAFT_FONTS_DIR: path.join(dataDir, 'fonts'),
  };
  const wrapperLines = [
    '#!/bin/sh',
    WRAPPER_MARKER,
    ...Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`),
    `exec ${shellQuote(nodePath)} ${shellQuote(helperEntry)} "$@"`,
  ];
  const manifest = {
    name: HOST_NAME,
    description: DEV_DESCRIPTION,
    path: wrapper,
    type: 'stdio',
    allowed_origins: [env.ROLECRAFT_ALLOWED_ORIGINS],
  };
  return {
    env,
    files: [
      { file: wrapper, mode: 0o755, content: `${wrapperLines.join('\n')}\n` },
      {
        file: path.join(hostDir, `${HOST_NAME}.json`),
        mode: 0o644,
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
    ],
  };
}

async function readOrNull(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 檢查目錄裡的 manifest／包裝檔是不是本腳本寫的。
 * 回傳 { manifest, wrapper }：'missing'｜'ours'｜'foreign'。
 */
export async function inspectExisting(hostDir) {
  const wrapperFile = path.join(hostDir, `${HOST_NAME}.sh`);
  const manifestText = await readOrNull(path.join(hostDir, `${HOST_NAME}.json`));
  const wrapperText = await readOrNull(wrapperFile);
  let manifest = 'missing';
  if (manifestText !== null) {
    let parsed;
    try {
      parsed = JSON.parse(manifestText);
    } catch {
      parsed = null;
    }
    manifest =
      parsed?.description === DEV_DESCRIPTION && parsed?.path === wrapperFile ? 'ours' : 'foreign';
  }
  let wrapper = 'missing';
  if (wrapperText !== null) {
    wrapper = wrapperText.split('\n')[1] === WRAPPER_MARKER ? 'ours' : 'foreign';
  }
  return { manifest, wrapper };
}

/** 字型資料夾裡缺哪些檔（只看存在；雜湊由 fetch-fonts.mjs 驗）。 */
export async function missingFonts(fontsDir) {
  const missing = [];
  for (const entry of BUNDLED_FONT_FILES) {
    try {
      await access(path.join(fontsDir, entry.fileName));
    } catch {
      missing.push(entry.fileName);
    }
  }
  return missing;
}

/** 預設的字型下載步驟：用目前的 node 跑 fetch-fonts.mjs --out <dir>。 */
export function runFetchFonts(fontsDir, { nodePath = process.execPath } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [FETCH_FONTS, '--out', fontsDir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`字型下載失敗（結束碼 ${code}）`)),
    );
  });
}

function refuseForeign(state, hostDir, verb) {
  if (state.manifest === 'foreign' || state.wrapper === 'foreign') {
    throw new Error(
      `${hostDir} 已有不是開發安裝寫的 ${HOST_NAME} 檔案（可能是正式安裝），不${verb}。請先手動確認。`,
    );
  }
}

export async function install(options, deps) {
  const { hostDir, extensionId, dataDir, apply } = options;
  const { nodePath, helperEntry, fetchFonts, log } = deps;
  requireAbsolute(nodePath, 'node 路徑');
  requireAbsolute(helperEntry, 'helper 進入點');
  await access(helperEntry).catch(() => {
    throw new Error(`找不到 helper 進入點：${helperEntry}`);
  });
  refuseForeign(await inspectExisting(hostDir), hostDir, '覆寫');
  const { env, files } = buildFiles({ hostDir, extensionId, dataDir, nodePath, helperEntry });
  const prefix = apply ? '' : '[乾跑] 將';
  log(`${prefix}建立資料區 ${dataDir}（字型 ${env.ROLECRAFT_FONTS_DIR}）`);
  if (apply) await mkdir(env.ROLECRAFT_FONTS_DIR, { recursive: true, mode: 0o700 });
  const missing = await missingFonts(env.ROLECRAFT_FONTS_DIR);
  if (missing.length === 0) log('字型已存在，不下載');
  else {
    log(`${prefix}下載字型（缺 ${missing.join('、')}）`);
    if (apply) await fetchFonts(env.ROLECRAFT_FONTS_DIR);
  }
  for (const { file, content, mode } of files) {
    log(`${prefix}寫入 ${file}\n${content}`);
    if (!apply) continue;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { mode });
    await chmod(file, mode);
  }
  log(apply ? '完成。請完全關閉並重開瀏覽器。' : '這是乾跑，沒有寫任何檔。確認後加 --yes。');
}

export async function uninstall({ hostDir, apply }, { log }) {
  const state = await inspectExisting(hostDir);
  refuseForeign(state, hostDir, '刪除');
  for (const ext of ['json', 'sh']) {
    const file = path.join(hostDir, `${HOST_NAME}.${ext}`);
    if (state[ext === 'json' ? 'manifest' : 'wrapper'] === 'missing') {
      log(`不存在，略過：${file}`);
      continue;
    }
    log(`${apply ? '' : '[乾跑] 將'}刪除 ${file}`);
    if (apply) await rm(file, { force: true });
  }
  log('資料區不刪除。');
  if (!apply) log('這是乾跑，沒有刪任何檔。確認後加 --yes。');
}

/** 進入點；全部外部相依可注入（測試用暫存目錄與假的字型下載）。 */
export async function run(argv, deps = {}) {
  const full = {
    home: os.homedir(),
    nodePath: process.execPath,
    helperEntry: HELPER_ENTRY,
    fetchFonts: runFetchFonts,
    log: (line) => console.log(line),
    ...deps,
  };
  const options = parseCli(argv, { home: full.home });
  if (options.action === 'uninstall') return uninstall(options, full);
  return install(options, full);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.message ?? error));
    process.exit(1);
  });
}
