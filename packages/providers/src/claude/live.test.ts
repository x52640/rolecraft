import { spawn as nodeSpawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { sanitizeEnvironment } from '../core/environment.ts';
import { createLauncher, type Launch, type ProcessOutput, type SpawnFn } from '../core/process.ts';
import { type RunDeps, runWithSubscriptionCheck } from '../core/run-check.ts';
import { createClaudeAdapter } from './adapter.ts';
import { CLAUDE_ENVIRONMENT, CLAUDE_MODEL_CANDIDATES } from './constants.ts';
import { createClaudeStreamGuard } from './guard.ts';
import { makeInjectionSandbox } from './injection-sandbox.ts';
import { verifyClaudeModel } from './models.ts';
import { inspectStdout } from './stream.ts';

/**
 * 真實 Claude CLI 測試（用擁有者訂閱；預設跳過）。
 *   RUN_LIVE=1                 S9-13 注入測試＋正式路徑各一次（模型呼叫 2 次、auth status 2 次）
 *   RUN_LIVE=1 RUN_LIVE_MODELS=1  另外逐一驗證模型候選（每個候選 auth status 1 次＋模型 1 次）
 * 全部用 haiku（模型驗證除外）與極短提示；不使用 --bare、--settings；子程序環境只有白名單。
 */

const LIVE = process.env['RUN_LIVE'] === '1';
const LIVE_MODELS = LIVE && process.env['RUN_LIVE_MODELS'] === '1';

/** 結果另存到 $TMPDIR/rolecraft-claude-live-results.jsonl（vitest 可能不顯示通過測試的 console）。 */
const RESULTS = join(tmpdir(), 'rolecraft-claude-live-results.jsonl');
function report(label: string, data: unknown): void {
  const line = JSON.stringify({ at: new Date().toISOString(), label, data });
  console.log(`[live] ${line}`);
  appendFileSync(RESULTS, `${line}\n`);
}

const counts = { version: 0, auth: 0, model: 0 };
const counting: SpawnFn = (file, args, options) => {
  if (args[0] === '--version') counts.version += 1;
  else if (args[0] === 'auth') counts.auth += 1;
  else counts.model += 1;
  return nodeSpawn(file, args, options);
};
const spawn = createClaudeStreamGuard(counting);

afterAll(() => {
  if (LIVE) report('CLI 呼叫次數', counts);
});

describe.skipIf(!LIVE)('live：Claude CLI', () => {
  it('S9-13：誘餌齊全的工作目錄＋注入提示 → 無工具呼叫、無誘餌、無 marker', async () => {
    const sandbox = await makeInjectionSandbox();
    try {
      const adapter = createClaudeAdapter();
      const env = {
        ...sanitizeEnvironment(process.env, CLAUDE_ENVIRONMENT).env,
        TMPDIR: sandbox.tmp,
      };
      const base = createLauncher({ provider: 'claude', env, cwd: sandbox.work, spawn });
      const outputs: ProcessOutput[] = [];
      const launch: Launch = async (request) => {
        const out = await base(request);
        outputs.push(out);
        return out;
      };

      // 在誘餌工作目錄跑執行前確認：專案設定的 apiKeyHelper 應被 auth status 抓到 → R6 擋下。
      const route = await adapter.verifySubscriptionRoute({ launch });
      expect(route.cliConfig.outcome).toBe('failed');
      expect(route.executionMode.outcome).toBe('passed');

      // 刻意略過 R6 閘門直接執行，驗證隔離旗標本身擋得住誘餌（同 ADR-0002 isolated-injection）。
      const result = await adapter.execute({ launch, model: 'haiku', prompt: sandbox.prompt });
      const run = outputs.at(-1);
      const all = outputs.map((o) => o.stdout + o.stderr).join('\n');
      const summary = {
        result,
        lastRun: adapter.lastRun,
        events: inspectStdout(run?.stdout ?? '').events.map((e) =>
          JSON.stringify([e['type'], e['subtype']]),
        ),
        canaries: sandbox.findCanaries(all),
        markers: await sandbox.listMarkers(),
      };
      report('S9-13', summary);
      expect(result.ok).toBe(true);
      expect(summary.canaries).toEqual([]);
      expect(summary.markers).toEqual([]);
      expect(inspectStdout(run?.stdout ?? '').violation).toBeNull();
      expect(adapter.lastRun?.cliVersion).toBe(adapter.lastCliVersion);
    } finally {
      await sandbox.dispose();
    }
  }, 120_000);

  it('正式路徑：runWithSubscriptionCheck（空工作目錄）→ R6 全過並執行', async () => {
    const adapter = createClaudeAdapter();
    const deps: RunDeps = {
      parentEnv: process.env,
      now: () => new Date(),
      newId: () => 'live-run',
      spawn,
    };
    const out = await runWithSubscriptionCheck(
      adapter,
      { model: 'haiku', prompt: '只回覆 OK 兩個字母。', trigger: 'run_start' },
      deps,
    );
    report('正式路徑', { out, lastRun: adapter.lastRun });
    expect(out.status).toBe('executed');
    expect(out.record.subscriptionOnly).toBe('passed');
    expect(out.status === 'executed' && out.result.ok).toBe(true);
  }, 120_000);

  it.skipIf(!LIVE_MODELS)(
    '模型候選逐一驗證',
    async () => {
      const adapter = createClaudeAdapter();
      const deps: RunDeps = {
        parentEnv: process.env,
        now: () => new Date(),
        newId: () => 'live-model',
        spawn,
      };
      const results = [];
      for (const model of CLAUDE_MODEL_CANDIDATES) {
        const r = await verifyClaudeModel(adapter, model, deps);
        results.push({
          model,
          available: r.available,
          resolved: r.resolvedModel,
          contextWindow: r.contextWindow,
          error: r.error,
        });
        if (r.error?.kind === 'quota_exhausted') break;
      }
      report('模型', results);
      expect(results.some((r) => r.available)).toBe(true);
    },
    300_000,
  );
});
