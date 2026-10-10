// P1-T037 回歸測試：spike 腳本的訂閱檢查、隔離探測判定、events.jsonl 遮蔽。
// 不呼叫真的 claude：run 一律換成假函式。執行：node --test scripts/spikes/claude/spike.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { CASES } from './cases.mjs';
import { assessAuthStatus, parseStream, preflightSubscription, summarizeEvents } from './lib.mjs';
import { main } from './run.mjs';

const SUBSCRIPTION = {
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  subscriptionType: 'pro',
};
const HELPER = {
  loggedIn: true,
  authMethod: 'api_key_helper',
  apiProvider: 'firstParty',
  apiKeySource: 'apiKeyHelper',
};
const UUID = '0b3c9f1e-1234-4abc-9def-0123456789ab';
const line = (e) => JSON.stringify(e) + '\n';
const INIT = { type: 'system', subtype: 'init', apiKeySource: 'none', model: 'haiku' };

/** 假的 runClaude：記錄每次呼叫，auth status 回 auth，其餘回 stream。 */
function fakeRun({ auth, stream = '' }) {
  const calls = [];
  const run = async ({ args }) => {
    calls.push(args);
    if (args[0] === 'auth') return { code: 0, stdout: JSON.stringify(auth), stderr: '' };
    return { code: 0, stdout: stream, stderr: '' };
  };
  return { run, calls };
}

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'rolecraft-spike-test-'));

test('--live --case 也要先過訂閱檢查；非訂閱就中止且不跑任何案例', async () => {
  const outDir = await tmp();
  const { run, calls } = fakeRun({ auth: HELPER });
  const code = await main(['--live', '--case', 'usermd-isolated'], {
    run,
    outDir,
    log: () => {},
  });
  assert.equal(code, 1);
  assert.deepEqual(calls, [['auth', 'status', '--json']]);
  assert.deepEqual(await readdir(outDir), []);
});

test('assessAuthStatus 只接受訂閱登入', () => {
  assert.equal(assessAuthStatus(JSON.stringify(SUBSCRIPTION)).ok, true);
  assert.equal(assessAuthStatus(JSON.stringify(HELPER)).ok, false);
  assert.equal(assessAuthStatus(JSON.stringify({ ...SUBSCRIPTION, loggedIn: false })).ok, false);
  assert.equal(
    assessAuthStatus(JSON.stringify({ ...SUBSCRIPTION, apiProvider: 'bedrock' })).ok,
    false,
  );
  assert.equal(
    assessAuthStatus(JSON.stringify({ ...SUBSCRIPTION, apiKeySource: 'ANTHROPIC_API_KEY' })).ok,
    false,
  );
  assert.equal(assessAuthStatus('not json').ok, false);
});

test('受管設定檔存在就不通過，也不呼叫 CLI', async () => {
  const dir = await tmp();
  const managed = path.join(dir, 'managed-settings.json');
  await writeFile(managed, '{}');
  const { run, calls } = fakeRun({ auth: SUBSCRIPTION });
  const gate = await preflightSubscription({
    run,
    sandbox: { tmp: dir, work: dir },
    managedSettings: managed,
  });
  assert.equal(gate.ok, false);
  assert.deepEqual(calls, []);
});

test('usermd-isolated：只有 init 的逾時、額度錯誤、空回覆都判 FAIL；成功回覆才可能 PASS', () => {
  const c = CASES.find((x) => x.id === 'usermd-isolated');
  const verdict = (stream) =>
    c
      .expect(summarizeEvents(parseStream(stream)), { markers: [], canaries: [] })
      .every(([, ok]) => ok);
  const result = (r) => line({ type: 'result', ...r });
  const timeout = line(INIT);
  const quota =
    timeout +
    result({ subtype: 'error_during_execution', is_error: true, result: 'quota exceeded' });
  const empty = timeout + result({ subtype: 'success', is_error: false, result: '  ' });
  const leaked = timeout + result({ subtype: 'success', is_error: false, result: '<private-token>' });
  const isolated = timeout + result({ subtype: 'success', is_error: false, result: 'NONE' });
  assert.equal(verdict(timeout), false);
  assert.equal(verdict(quota), false);
  assert.equal(verdict(empty), false);
  assert.equal(verdict(leaked), false);
  assert.equal(verdict(isolated), true);
});

test('events.jsonl 逐行遮蔽 UUID、家目錄、email，且仍是一行一個 JSON', async () => {
  const outDir = await tmp();
  const stream =
    line({
      ...INIT,
      session_id: UUID,
      cwd: path.join(os.homedir(), 'x'),
      email: 'a.b@example.com',
    }) +
    line({ type: 'result', subtype: 'success', is_error: false, result: 'NONE', session_id: UUID });
  const { run, calls } = fakeRun({ auth: SUBSCRIPTION, stream });
  const code = await main(['--live', '--case', 'usermd-isolated'], {
    run,
    outDir,
    log: () => {},
  });
  assert.equal(code, 0);
  assert.equal(calls[0][0], 'auth');
  const text = await readFile(path.join(outDir, 'usermd-isolated.events.jsonl'), 'utf8');
  assert.ok(!text.includes(UUID));
  assert.ok(!text.includes(os.homedir()));
  assert.ok(!text.includes('a.b@example.com'));
  const events = text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(events.length, 2);
  assert.equal(events[0].session_id, '<uuid>');
  assert.equal(events[0].cwd, '~/x');
});
