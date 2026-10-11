// P1-T059 開發安裝腳本測試。全部路徑注入暫存目錄（假家目錄），字型下載用假函式；不碰真的家目錄、不連網。
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';

import { BUNDLED_FONT_FILES } from '../../packages/pdf-export/src/fonts/manifest.ts';
import {
  browserHostDirs,
  defaultDataDir,
  DEV_DESCRIPTION,
  HELPER_ENTRY,
  HOST_NAME,
  run,
} from './install-helper.mjs';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
let tmp;
let home;
let entry;
let fetched;
let logs;

const chromeDir = () => browserHostDirs(home).chrome;
const deps = (extra = {}) => ({
  home,
  nodePath: process.execPath,
  helperEntry: entry,
  fetchFonts: async (dir) => {
    fetched.push(dir);
  },
  log: (line) => logs.push(line),
  ...extra,
});

async function listAll(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (item.isFile()) out.push(path.join(item.parentPath, item.name));
  }
  return out.sort();
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-dev-install-'));
  home = path.join(tmp, 'home');
  await mkdir(home);
  // 假的 helper 進入點：印出包裝檔設好的環境變數與參數，用來檢查包裝檔真的能跑、引號正確
  entry = path.join(tmp, 'fake-helper.mjs');
  await writeFile(
    entry,
    'const k = ["ROLECRAFT_ALLOWED_ORIGINS","ROLECRAFT_DATA_DIR","ROLECRAFT_FONTS_DIR"];\n' +
      'console.log(JSON.stringify({ env: Object.fromEntries(k.map((n) => [n, process.env[n]])), argv: process.argv.slice(2) }));\n',
  );
  fetched = [];
  logs = [];
  assert.notEqual(home, os.homedir());
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('預設路徑都在注入的家目錄下', () => {
  const dirs = browserHostDirs(home);
  const support = path.join(home, 'Library', 'Application Support');
  assert.equal(dirs.chrome, path.join(support, 'Google', 'Chrome', 'NativeMessagingHosts'));
  assert.equal(dirs.edge, path.join(support, 'Microsoft Edge', 'NativeMessagingHosts'));
  assert.equal(dirs.arc, path.join(support, 'Arc', 'User Data', 'NativeMessagingHosts'));
  assert.equal(defaultDataDir(home), path.join(support, 'RoleCraft-dev'));
  assert.ok(HELPER_ENTRY.endsWith(path.join('apps', 'helper', 'src', 'main.ts')));
});

test('沒有 --yes 是乾跑：不寫任何檔、不下載字型', async () => {
  const before = await listAll(tmp);
  await run(['--extension-id', ID], deps());
  assert.deepEqual(await listAll(tmp), before);
  assert.deepEqual(fetched, []);
  assert.ok(logs.some((l) => l.includes('乾跑')));
  assert.ok(logs.some((l) => l.includes(`chrome-extension://${ID}/`)));
});

test('--yes 寫出 manifest 與包裝檔（三個環境變數），缺字型就下載', async () => {
  const dataDir = path.join(tmp, "data dir's");
  await run(['--extension-id', ID, '--data-dir', dataDir, '--yes'], deps());
  const fontsDir = path.join(dataDir, 'fonts');
  assert.deepEqual(fetched, [fontsDir]);
  assert.ok((await stat(fontsDir)).isDirectory());

  const wrapper = path.join(chromeDir(), `${HOST_NAME}.sh`);
  const manifest = JSON.parse(await readFile(path.join(chromeDir(), `${HOST_NAME}.json`), 'utf8'));
  assert.deepEqual(manifest, {
    name: 'com.rolecraft.helper',
    description: DEV_DESCRIPTION,
    path: wrapper,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${ID}/`],
  });
  assert.equal((await stat(wrapper)).mode & 0o777, 0o755);
  const text = await readFile(wrapper, 'utf8');
  for (const name of ['ROLECRAFT_ALLOWED_ORIGINS', 'ROLECRAFT_DATA_DIR', 'ROLECRAFT_FONTS_DIR']) {
    assert.match(text, new RegExp(`^export ${name}=`, 'm'));
  }
  assert.ok(text.includes(process.execPath));

  // 真的執行包裝檔：瀏覽器會把呼叫者 origin 當第一個參數
  const { stdout } = await promisify(execFile)('/bin/sh', [wrapper, `chrome-extension://${ID}/`], {
    env: { PATH: '/usr/bin:/bin' },
  });
  assert.deepEqual(JSON.parse(stdout), {
    env: {
      ROLECRAFT_ALLOWED_ORIGINS: `chrome-extension://${ID}/`,
      ROLECRAFT_DATA_DIR: dataDir,
      ROLECRAFT_FONTS_DIR: fontsDir,
    },
    argv: [`chrome-extension://${ID}/`],
  });
});

test('預設資料區在家目錄下；字型都在就不下載；--browser edge 寫到 Edge 目錄', async () => {
  const fontsDir = path.join(defaultDataDir(home), 'fonts');
  await mkdir(fontsDir, { recursive: true });
  for (const f of BUNDLED_FONT_FILES) await writeFile(path.join(fontsDir, f.fileName), 'x');
  await run(['--browser', 'edge', '--extension-id', ID, '--yes'], deps());
  assert.deepEqual(fetched, []);
  const edgeDir = browserHostDirs(home).edge;
  assert.deepEqual(
    (await readdir(edgeDir)).sort(),
    [`${HOST_NAME}.json`, `${HOST_NAME}.sh`].sort(),
  );
  const text = await readFile(path.join(edgeDir, `${HOST_NAME}.sh`), 'utf8');
  assert.ok(text.includes(`export ROLECRAFT_DATA_DIR='${defaultDataDir(home)}'`));
});

test('--uninstall 只刪自己寫的兩個檔，不刪資料區與其他 host', async () => {
  const dataDir = path.join(tmp, 'data');
  await run(['--extension-id', ID, '--data-dir', dataDir, '--yes'], deps());
  const other = path.join(chromeDir(), 'com.other.tool.json');
  await writeFile(other, '{}');
  await writeFile(path.join(dataDir, 'rolecraft.sqlite'), 'db');

  await run(['--uninstall'], deps());
  assert.equal((await readdir(chromeDir())).length, 3, '乾跑不刪');

  await run(['--uninstall', '--yes'], deps());
  assert.deepEqual(await readdir(chromeDir()), ['com.other.tool.json']);
  assert.equal(await readFile(path.join(dataDir, 'rolecraft.sqlite'), 'utf8'), 'db');
  assert.ok((await stat(path.join(dataDir, 'fonts'))).isDirectory());
});

test('不是開發安裝寫的同名檔：安裝不覆寫、移除不刪', async () => {
  await mkdir(chromeDir(), { recursive: true });
  const foreign = path.join(chromeDir(), `${HOST_NAME}.json`);
  await writeFile(foreign, JSON.stringify({ name: HOST_NAME, path: '/Applications/x' }));
  await assert.rejects(run(['--extension-id', ID, '--yes'], deps()), /不是開發安裝/);
  await assert.rejects(run(['--uninstall', '--yes'], deps()), /不是開發安裝/);
  assert.deepEqual(await readdir(chromeDir()), [`${HOST_NAME}.json`]);
  assert.deepEqual(fetched, []);
});

test('參數錯誤一律拒絕且不寫檔', async () => {
  const before = await listAll(tmp);
  const bad = [
    ['--yes'],
    ['--extension-id', ID.toUpperCase(), '--yes'],
    ['--extension-id', ID.slice(1), '--yes'],
    ['--extension-id', `${ID.slice(1)}q`, '--yes'],
    ['--extension-id', `${ID}/`, '--yes'],
    ['--extension-id', ID, '--data-dir', 'relative/dir', '--yes'],
    ['--extension-id', ID, '--data-dir', `${tmp}/a\nb`, '--yes'],
    ['--extension-id', ID, '--browser', 'safari', '--yes'],
    ['--extension-id', ID, '--target-dir', tmp, '--yes'],
    ['--extension-id', ID, 'extra', '--yes'],
  ];
  for (const argv of bad) {
    await assert.rejects(run(argv, deps()), undefined, argv.join(' '));
  }
  assert.deepEqual(await listAll(tmp), before);
  assert.deepEqual(fetched, []);
});

test('helper 進入點不存在就拒絕', async () => {
  await assert.rejects(
    run(['--extension-id', ID, '--yes'], deps({ helperEntry: path.join(tmp, 'nope.ts') })),
    /找不到 helper 進入點/,
  );
  await assert.rejects(
    run(['--extension-id', ID, '--yes'], deps({ nodePath: 'node' })),
    /node 路徑/,
  );
});
