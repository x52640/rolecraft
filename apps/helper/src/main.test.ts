// 端到端：用真實子行程跑 main.ts（模擬瀏覽器以 stdio 啟動 host），以及原始碼靜態掃描。
// 子程序只出現在測試裡；正式原始碼不得有任何子程序／shell／檔案系統呼叫（R7）。
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED,
  anyString,
  containing,
  OTHER,
  SECRET,
  requests,
} from './__fixtures__/requests.ts';
import { ALLOWED_ORIGINS_ENV, FrameDecoder, encodeFrame } from './index.ts';

const MAIN = path.join(import.meta.dirname, 'main.ts');

interface RunResult {
  code: number | null;
  replies: unknown[];
  stderr: string;
}

function runHost(args: string[], env: Record<string, string>, stdin: Buffer): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, stdio: 'pipe' });
    const decoder = new FrameDecoder();
    const replies: unknown[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => replies.push(...decoder.push(chunk)));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, replies, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

const env = { [ALLOWED_ORIGINS_ENV]: ALLOWED };

describe('main（真實 stdio 子行程）', () => {
  it('合法 origin：依序回覆、未接服務回尚未支援、stderr 不含內容', async () => {
    const stdin = Buffer.concat([
      encodeFrame(requests.submit_message_capture),
      encodeFrame({ op: 'run_command', payload: { cmd: SECRET } }),
    ]);
    const result = await runHost([ALLOWED], env, stdin);
    expect(result.code).toBe(0);
    expect(result.replies).toEqual([
      {
        ok: false,
        error: { code: 'internal_error', message: containing('not_implemented') },
      },
      { ok: false, error: { code: 'invalid_request', message: anyString } },
    ]);
    expect(result.stderr).toContain('host_started');
    expect(result.stderr).not.toContain('王小明');
    expect(result.stderr).not.toContain('rm -rf');
  });

  it('origin 不在允許清單：結束碼 2、沒有任何回覆', async () => {
    const result = await runHost([OTHER], env, encodeFrame(requests.open_editor));
    expect(result.code).toBe(2);
    expect(result.replies).toEqual([]);
  });

  it('沒設定允許清單：全部拒絕', async () => {
    const result = await runHost([ALLOWED], {}, encodeFrame(requests.open_editor));
    expect(result.code).toBe(2);
  });

  it('允許清單格式錯：結束碼 1', async () => {
    const result = await runHost([ALLOWED], { [ALLOWED_ORIGINS_ENV]: '*' }, Buffer.alloc(0));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('config_invalid');
  });

  it('壞 JSON：結束碼 3', async () => {
    const body = Buffer.from('{oops', 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    const result = await runHost([ALLOWED], env, Buffer.concat([header, body]));
    expect(result.code).toBe(3);
  });
});

/** 正式原始碼（不含測試與 fixture）。 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('R7 靜態檢查：正式原始碼沒有子程序、shell、檔案系統或動態執行', () => {
  const FORBIDDEN = [
    /child_process/,
    /['"](node:)?fs(\/promises)?['"]/,
    /\bexecFile\b|\bexecSync\b|\bspawn\b|\bfork\(/,
    /\beval\(|new Function\(/,
    /['"](node:)?(vm|worker_threads|net|http|https|dgram)['"]/,
    /process\.binding|process\.dlopen/,
    /\bimport\(/,
  ];
  const files = sourceFiles(import.meta.dirname);

  it('掃到正式原始碼', () => {
    expect(files.map((f) => path.basename(f))).toContain('dispatch.ts');
  });

  it.each(files.map((f) => [path.relative(import.meta.dirname, f), f]))('%s', (_name, file) => {
    const code = readFileSync(file, 'utf8');
    expect(FORBIDDEN.filter((re) => re.test(code)).map(String)).toEqual([]);
  });
});
