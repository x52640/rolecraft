// P1-T011 spike 入口：驗證 claude CLI 的 R5 隔離與 R6 訂閱登入。
//
//   node scripts/spikes/claude/run.mjs                 只印計畫（不呼叫 CLI）
//   node scripts/spikes/claude/run.mjs --live [--case <id>,<id>]
//
// --live 才真的呼叫 claude（會用擁有者的訂閱額度，每個模型案例 1 次極短呼叫，haiku）。
// 不使用 --bare；子程序環境由 lib.buildEnv 白名單組出並硬檢查。
// --live 執行任何案例前（含 --case 只跑一案）先在真實使用者設定下跑 auth status，非訂閱登入就中止。
// 結果：$TMPDIR/rolecraft-claude-spike-results/<case>.json 與 <case>.events.jsonl
// （兩者都已遮蔽家目錄、email、UUID）＋終端摘要。
/* global console, process */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { ALL_CANARIES, CASES } from './cases.mjs';
import { makeSandbox } from './fixtures.mjs';
import {
  buildEnv,
  CLAUDE_BIN,
  findCanaries,
  grepDebugLog,
  listMarkers,
  parseStream,
  preflightSubscription,
  redact,
  redactJsonl,
  runClaude,
  summarizeEvents,
} from './lib.mjs';

const DEBUG_PATTERNS = {
  claudeMd: /CLAUDE\.md/,
  settings: /settings\.json|setting.?source/i,
  hooks: /hook/i,
  apiKey: /apiKeyHelper|api.?key|apiKeySource/i,
  mcp: /\bmcp\b/i,
  plugin: /plugin/i,
  auth: /oauth|keychain|subscription|auth/i,
};

async function runCase(c, run) {
  const sb = await makeSandbox(c.variant);
  const home = c.home === 'fake' ? sb.home : os.homedir();
  const env = buildEnv({ home, tmpdir: sb.tmp, experiment: c.experiment?.(sb) ?? {} });
  const args = c.args(sb);
  const stdin = c.prompt ? c.prompt(sb) : '';
  const started = Date.now();
  const res = await run({ args, env, cwd: sb.work, stdin, timeoutMs: c.timeoutMs });
  const ms = Date.now() - started;
  const markers = await listMarkers(sb.markers);
  const canaries = findCanaries(res.stdout + res.stderr, ALL_CANARIES);
  const out = {
    id: c.id,
    note: c.note,
    sandbox: sb.root,
    envNames: Object.keys(env),
    args,
    ms,
    exit: res.code,
    markers,
    canaries,
  };
  if (c.model) {
    const summary = summarizeEvents(parseStream(res.stdout));
    out.summary = summary;
    out.debug = await grepDebugLog(path.join(sb.root, 'debug.log'), DEBUG_PATTERNS);
    for (const k of Object.keys(out.debug.hits ?? {}))
      out.debug.hits[k] = out.debug.hits[k].slice(0, 15);
    out.checks = c.expect(summary, { markers, canaries }).map(([name, ok]) => ({ name, ok }));
  } else {
    out.stdout = res.stdout.slice(0, 2000);
  }
  out.stderr = res.stderr.slice(0, 1000);
  if (c.model) Object.defineProperty(out, 'rawStdout', { value: res.stdout, enumerable: false });
  return out;
}

/**
 * 入口。deps 供測試替換（run：取代真的 claude 呼叫；outDir；log）。回傳結束碼。
 */
export async function main(
  argv,
  {
    run = runClaude,
    outDir = path.join(os.tmpdir(), 'rolecraft-claude-spike-results'),
    log = console.log,
  } = {},
) {
  const { values: opts } = parseArgs({
    args: argv,
    options: { live: { type: 'boolean' }, case: { type: 'string' } },
  });
  const wanted = opts.case ? new Set(opts.case.split(',')) : null;
  const selected = CASES.filter((c) => !wanted || wanted.has(c.id));

  if (!existsSync(CLAUDE_BIN)) log(`找不到 ${CLAUDE_BIN}`);
  if (!opts.live) {
    log('計畫（加 --live 才會真的呼叫 claude）：');
    for (const c of selected) {
      log(`- ${c.id}${c.model ? '（模型呼叫）' : ''}：${c.note}`);
      log(
        `    HOME=${c.home}  沙箱=${c.variant}  args=${JSON.stringify(c.args({ root: '<root>' }))}`,
      );
    }
    log(`模型呼叫數：${selected.filter((c) => c.model).length}`);
    return 0;
  }

  // 不論選了哪些案例，先確認真實使用者設定走訂閱；否則 control-*／usermd-* 可能改走 API key 計費。
  const gate = await preflightSubscription({ run, sandbox: await makeSandbox('empty') });
  if (!gate.ok) {
    log(`中止：執行前訂閱檢查未通過（${gate.reason}），沒有執行任何案例。`);
    return 1;
  }
  log(`執行前訂閱檢查通過：${gate.reason}`);

  await mkdir(outDir, { recursive: true });
  let modelCalls = 0;
  for (const c of selected) {
    if (c.model) modelCalls += 1;
    const out = await runCase(c, run);
    await writeFile(path.join(outDir, `${c.id}.json`), redact(out));
    if (out.rawStdout)
      await writeFile(path.join(outDir, `${c.id}.events.jsonl`), redactJsonl(out.rawStdout));
    const verdict = out.checks ? (out.checks.every((x) => x.ok) ? 'PASS' : 'FAIL') : 'INFO';
    log(`\n== ${c.id} [${verdict}] exit=${out.exit} ${out.ms}ms`);
    for (const x of out.checks ?? []) log(`   ${x.ok ? '✓' : '✗'} ${x.name}`);
    log(`   canaries=${JSON.stringify(out.canaries)} markers=${JSON.stringify(out.markers)}`);
    if (out.summary)
      log(
        `   apiKeySource=${out.summary.apiKeySource} tools=${JSON.stringify(out.summary.tools)} cost=${out.summary.totalCostUsd}`,
      );
    if (out.stdout) log(`   ${redact(out.stdout.trim())}`);
  }
  log(`\n模型呼叫：${modelCalls}；結果在 ${outDir}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
