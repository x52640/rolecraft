import { spawn as nodeSpawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sanitizeEnvironment } from '../core/environment.ts';
import { createLauncher, type SpawnFn } from '../core/process.ts';
import { parseVersion } from './auth.ts';
import { CLAUDE_ENVIRONMENT, CLAUDE_VERSION_COMMAND } from './constants.ts';
import { findManagedSettings, locateClaude } from './locate.ts';
import { CLAUDE_REVERIFY_MAX_MODEL_CALLS, runClaudeReverification } from './reverify.ts';

/**
 * 真實 Claude CLI：自動重新驗證（P1-T039，預設跳過）。
 *   RUN_LIVE=1 npx vitest run packages/providers/src/claude/reverify-live.test.ts
 * 把目前安裝的版本當成「未驗證版本」跑一次完整重新驗證（不寫任何保存位置）。
 * 預期呼叫：模型 2 次（haiku、極短提示）、auth status 2 次、--version 3 次（含開頭讀版本 1 次）。
 * 不使用 --bare、--settings；子程序環境只有白名單；誘餌沙箱在系統暫存區、結束即刪除。
 * 結果另寫 $TMPDIR/rolecraft-claude-live-results.jsonl。
 */

const LIVE = process.env['RUN_LIVE'] === '1';
const RESULTS = join(tmpdir(), 'rolecraft-claude-live-results.jsonl');

describe.skipIf(!LIVE)('live：Claude CLI 自動重新驗證', () => {
  it('目前版本模擬未驗證版本 → 全部案例通過', async () => {
    const counts = { version: 0, auth: 0, model: 0 };
    const spawn: SpawnFn = (file, args, options) => {
      if (args[0] === '--version') counts.version += 1;
      else if (args[0] === 'auth') counts.auth += 1;
      else counts.model += 1;
      return nodeSpawn(file, args, options);
    };
    const path = await locateClaude();
    expect(path).not.toBeNull();
    if (!path) return;
    const env = sanitizeEnvironment(process.env, CLAUDE_ENVIRONMENT).env;
    const launch = createLauncher({ provider: 'claude', env, cwd: tmpdir(), spawn });
    const version = parseVersion(
      await launch({ executablePath: path, command: CLAUDE_VERSION_COMMAND }),
    );
    expect(version).not.toBeNull();
    if (!version) return;

    const record = await runClaudeReverification(
      {
        executablePath: path,
        version,
        locate: () => locateClaude(),
        findManagedSettings: () => findManagedSettings(),
      },
      { parentEnv: process.env, now: () => new Date(), spawn },
    );
    const line = JSON.stringify({ at: new Date().toISOString(), label: 'P1-T039', record, counts });
    console.log(`[live] ${line}`);
    appendFileSync(RESULTS, `${line}\n`);
    expect(counts.model).toBeLessThanOrEqual(CLAUDE_REVERIFY_MAX_MODEL_CALLS);
    expect(record.modelCalls).toBe(counts.model);
    expect(record.outcome).toBe('verified');
  }, 180_000);
});
