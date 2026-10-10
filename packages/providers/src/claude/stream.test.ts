import { describe, expect, it } from 'vitest';

import type { ProcessOutput } from '../core/process.ts';
import { fixture } from './fake-spawn.ts';
import { analyzeRun, classifyResultError } from './result.ts';
import { checkInit, inspectStdout, toolEventReason } from './stream.ts';

const output = (stdout: string, extra: Partial<ProcessOutput> = {}): ProcessOutput => ({
  exitCode: 0,
  stdout,
  stderr: '',
  aborted: false,
  truncated: false,
  ...extra,
});

const firstLine = (name: string): Record<string, unknown> =>
  JSON.parse(fixture(name).split('\n')[0] ?? '') as Record<string, unknown>;

describe('init 事件（錄製輸出）', () => {
  it('正式旗標的 init 通過', () => {
    expect(checkInit(firstLine('run-ok.jsonl'))).toEqual([]);
  });

  it('有工具、skills、slash commands 的 init 不通過', () => {
    const problems = checkInit(firstLine('run-init-tools.jsonl'));
    expect(problems).toContain('tools 不是空的');
    expect(problems).toContain('skills 不是空的');
  });

  it('apiKeySource 不是 none、載入使用者外掛 → 不通過', () => {
    const problems = checkInit(firstLine('run-init-api-key.jsonl'));
    expect(problems.join()).toContain('apiKeySource 不是 none（ANTHROPIC_API_KEY）');
    expect(problems).toContain('載入了非內建外掛');
  });

  it('mcp_servers 非空、第一個事件不是 init → 不通過', () => {
    const init = firstLine('run-ok.jsonl');
    expect(checkInit({ ...init, mcp_servers: [{ name: 'x' }] })).toContain('mcp_servers 不是空的');
    expect(checkInit({ type: 'assistant' })).toEqual(['第一個事件不是 system/init']);
  });

  it('init 回報的 CLI 版本與驗證版本不同 → 不通過', () => {
    const problems = checkInit(firstLine('run-version-mismatch.jsonl'));
    expect(problems.join()).toContain('2.1.300');
  });
});

describe('工具事件偵測', () => {
  it.each([
    [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }],
    [{ type: 'assistant', message: { content: [{ type: 'server_tool_use', name: 'web' }] } }],
    [{ type: 'user', message: { content: [{ type: 'tool_result' }] } }],
    [{ type: 'system', subtype: 'permission_denied' }],
    [{ type: 'system', subtype: 'hook_started' }],
    [{ type: 'tool_progress' }],
    [{ type: 'result', permission_denials: [{ tool_name: 'Read' }] }],
  ])('%j 算工具事件', (event) => {
    expect(toolEventReason(event)).not.toBeNull();
  });

  it('一般文字、thinking、rate_limit_event 不算', () => {
    const events = inspectStdout(fixture('run-ok.jsonl')).events.slice(1);
    expect(events.map(toolEventReason)).toEqual(events.map(() => null));
  });
});

describe('analyzeRun：錄製輸出的判定', () => {
  it('正常 → 回傳 result 文字與上下文上限', () => {
    const { result, info } = analyzeRun(output(fixture('run-ok.jsonl')));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('沒有執行文件裡的指令');
    expect(info).toMatchObject({
      cliVersion: '2.1.296',
      model: 'claude-haiku-5-5',
      contextWindow: 1000000,
      maxOutputTokens: 128000,
      rateLimitStatus: 'allowed',
    });
  });

  it.each([
    ['run-tool-use.jsonl', '工具'],
    ['run-init-tools.jsonl', 'init 異常'],
    ['run-init-api-key.jsonl', 'apiKeySource'],
    ['run-version-mismatch.jsonl', '2.1.300'],
  ])('%s → 隔離失敗、丟棄輸出', (name, reason) => {
    const { result } = analyzeRun(output(fixture(name)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('other');
    expect(result.error.message).toContain('隔離檢查失敗');
    expect(result.error.message).toContain(reason);
    expect(JSON.stringify(result)).not.toContain('權限');
  });

  it('is_error＋401 但 subtype=success → 失敗（不只看 subtype）', () => {
    const { result } = analyzeRun(output(fixture('run-is-error-401.jsonl'), { exitCode: 1 }));
    expect(result).toEqual({
      ok: false,
      error: { kind: 'other', message: 'Claude 登入或授權失敗（success／HTTP 401）' },
    });
  });

  it.each(['run-quota-rejected.jsonl', 'run-quota-429.jsonl'])('%s → 額度用完', (name) => {
    const { result } = analyzeRun(output(fixture(name), { exitCode: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('quota_exhausted');
  });

  it('取消、截斷、沒有事件、沒有 result、非 JSON 行', () => {
    const ok = fixture('run-ok.jsonl');
    const init = ok.split('\n')[0] ?? '';
    const kind = (o: ProcessOutput) => {
      const r = analyzeRun(o).result;
      return r.ok ? 'ok' : r.error.kind;
    };
    expect(kind(output(init, { aborted: true, exitCode: null }))).toBe('cancelled');
    expect(kind(output(ok, { truncated: true }))).toBe('other');
    expect(kind(output('', { exitCode: 1 }))).toBe('other');
    expect(kind(output(`${init}\n`))).toBe('other');
    expect(analyzeRun(output(`${init}\n{"type":"assist`)).result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('非 JSON') as unknown },
    });
  });
});

describe('result 錯誤分類', () => {
  const base = { type: 'result', subtype: 'success', is_error: true };
  it.each([
    [{ ...base, api_error_status: 429 }, 'quota_exhausted'],
    [{ ...base, api_error_status: null, result: 'Claude usage limit reached' }, 'quota_exhausted'],
    [{ ...base, api_error_status: 529 }, 'transient'],
    [{ ...base, api_error_status: 500 }, 'transient'],
    [{ ...base, api_error_status: 403 }, 'other'],
    [{ type: 'result', subtype: 'error_max_turns', is_error: false }, 'other'],
    [{ type: 'result', subtype: 'success', is_error: false, api_error_status: 400 }, 'other'],
  ])('%j → %s', (event, kind) => {
    const r = classifyResultError(event);
    expect(r?.ok === false ? r.error.kind : null).toBe(kind);
  });

  it('正常 result 不是錯誤', () => {
    expect(
      classifyResultError({
        type: 'result',
        subtype: 'success',
        is_error: false,
        api_error_status: null,
      }),
    ).toBeNull();
  });
});
