/* global Buffer, process, setTimeout */
// 可重跑：node --test scripts/spikes/bridge/test/
// 驗 host 的框編解碼、固定操作清單、拒絕未知操作／多餘欄位、真實子行程 stdio 往返。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { startHost } from '../host/echo-host.mjs';
import {
  FrameDecoder,
  MAX_INCOMING_BYTES,
  MAX_OUTGOING_BYTES,
  encodeFrame,
} from '../host/framing.mjs';
import { route } from '../host/protocol.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(HERE, '..', 'host', 'echo-host.mjs');
const ORIGIN = `chrome-extension://${'a'.repeat(32)}/`;

test('框：編碼後可解回，含中文多位元組', () => {
  const frame = encodeFrame({ text: '履歷 ✓' });
  assert.equal(frame.readUInt32LE(0), frame.length - 4);
  assert.deepEqual(new FrameDecoder().push(frame), [{ text: '履歷 ✓' }]);
});

test('框：任意切碎、多則黏在一起都能正確解', () => {
  const all = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: '二' })]);
  const decoder = new FrameDecoder();
  const got = [];
  for (const byte of all) got.push(...decoder.push(Buffer.from([byte])));
  assert.deepEqual(got, [{ a: 1 }, { b: '二' }]);
  assert.equal(decoder.hasPartial, false);
});

test('框：超過輸入上限、壞 JSON 都丟錯', () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(MAX_INCOMING_BYTES + 1, 0);
  assert.throws(() => new FrameDecoder().push(header), { code: 'incoming_too_large' });
  const bad = Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from('{x}')]);
  assert.throws(() => new FrameDecoder().push(bad), { code: 'bad_json' });
});

test('框：輸出超過 1 MB 拒絕編碼', () => {
  assert.throws(() => encodeFrame({ s: 'x'.repeat(MAX_OUTGOING_BYTES) }), {
    code: 'outgoing_too_large',
  });
});

test('操作：ping、echo 正常', () => {
  assert.deepEqual(route({ id: '1', op: 'ping' }).reply, {
    id: '1',
    ok: true,
    result: { pong: true },
  });
  assert.deepEqual(route({ id: '2', op: 'echo', text: 'hi' }).reply.result, { text: 'hi' });
});

test('操作：未知操作、多餘欄位（路徑／指令）、型別錯都拒絕', () => {
  const cases = [
    [{ id: '1', op: 'exec', cmd: 'ls' }, 'unknown_op'],
    [{ id: '1', op: 'readFile', path: '/etc/passwd' }, 'unknown_op'],
    [{ id: '1', op: '__proto__' }, 'unknown_op'],
    [{ id: '1', op: 'echo', text: 'x', path: '/tmp' }, 'unexpected_field'],
    [{ id: '1', op: 'pickFolders', path: '/Users' }, 'unexpected_field'],
    [{ id: '1', op: 'echo', text: 42 }, 'bad_field'],
    [{ id: '1', op: 'echo', text: 'x'.repeat(5000) }, 'bad_field'],
    [{ op: 'ping' }, 'bad_request'],
    [['ping'], 'bad_request'],
    [null, 'bad_request'],
  ];
  for (const [message, code] of cases) {
    assert.equal(route(message).reply?.error.code, code, JSON.stringify(message));
  }
});

function memoryHost(options = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const exits = [];
  const decoder = new FrameDecoder(MAX_OUTGOING_BYTES);
  const replies = [];
  output.on('data', (chunk) => replies.push(...decoder.push(chunk)));
  startHost({ input, output, origin: ORIGIN, exit: (code) => exits.push(code), ...options });
  return { input, replies, exits };
}

test('host：origin 格式不符直接結束', () => {
  const exits = [];
  startHost({
    input: new PassThrough(),
    output: new PassThrough(),
    origin: 'https://evil.example/',
    exit: (code) => exits.push(code),
  });
  assert.deepEqual(exits, [2]);
});

test('host：pickFolders 只回不透明 ID 與名稱，不回路徑；符號連結解析到實際位置', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rolecraft-bridge-')));
  await mkdir(path.join(root, 'real-project'));
  await symlink(path.join(root, 'real-project'), path.join(root, 'linked'));
  const dialog = () =>
    Promise.resolve([path.join(root, 'linked'), path.join(root, 'real-project')]);
  const { input, replies } = memoryHost({ dialog });
  input.write(encodeFrame({ id: 'p1', op: 'pickFolders' }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const [reply] = replies;
  assert.equal(reply.ok, true);
  assert.equal(reply.result.folders[0].name, 'real-project');
  assert.equal(reply.result.folders[0].resolvedFromLink, true);
  assert.equal(reply.result.folders[1].resolvedFromLink, false);
  assert.notEqual(reply.result.folders[0].id, reply.result.folders[1].id);
  assert.equal(JSON.stringify(reply).includes(root), false, '回覆不得含完整路徑');
});

test('host：取消選取回 cancelled', async () => {
  const { input, replies } = memoryHost({ dialog: () => Promise.resolve([]) });
  input.write(encodeFrame({ id: 'p2', op: 'pickFolders' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(replies[0].result, { cancelled: true, folders: [] });
});

test('host：壞框回錯誤並結束', () => {
  const { input, replies, exits } = memoryHost();
  input.write(Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from('{x}')]));
  assert.equal(replies[0].error.code, 'bad_json');
  assert.deepEqual(exits, [3]);
});

test('子行程：真實 stdio 往返（等同瀏覽器啟動 host 的方式）', async () => {
  const child = spawn(process.execPath, [HOST, ORIGIN], { stdio: ['pipe', 'pipe', 'pipe'] });
  const decoder = new FrameDecoder(MAX_OUTGOING_BYTES);
  const replies = [];
  child.stdout.on('data', (chunk) => replies.push(...decoder.push(chunk)));
  child.stdin.write(encodeFrame({ id: '1', op: 'echo', text: '你好' }));
  child.stdin.write(encodeFrame({ id: '2', op: 'exec', cmd: 'rm -rf /' }));
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.deepEqual(replies[0], { id: '1', ok: true, result: { text: '你好' } });
  assert.equal(replies[1].error.code, 'unknown_op');
});
