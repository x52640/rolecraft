// P1-T011 spike 共用：清理後環境、呼叫 claude、解析 stream-json、整理判定用摘要。
/* global process, setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const CLAUDE_BIN = path.join(os.homedir(), '.local/bin/claude');

/**
 * 子程序環境只帶這幾個名稱（白名單），值由 spike 指定；其餘一律不帶，
 * 包括 CLAUDE_CODE_*（例：CLAUDE_CODE_PLUGIN_DIRS 會載入外掛）與任何 API key。
 */
const ENV_ALLOW = new Set(['HOME', 'USER', 'LOGNAME', 'LANG', 'PATH', 'TMPDIR']);

/** 只有明確宣告的實驗變數可以超出白名單（目前只有 CLAUDE_CONFIG_DIR 探測）。 */
const ENV_EXPERIMENT = new Set(['CLAUDE_CONFIG_DIR']);

/** 不論如何都不得出現在子程序環境的名稱樣式（計費／金鑰／雲端供應商）。 */
const FORBIDDEN_ENV =
  /^(ANTHROPIC_|AWS_|GOOGLE_|VERTEX|AZURE_|OPENAI_|CODEX_|CLAUDE_CODE_USE_)|API_KEY|AUTH_TOKEN|OAUTH_TOKEN/i;

/** 組出子程序環境；任何不合白名單或命中禁用樣式的名稱直接丟錯（呼叫前的硬檢查）。 */
export function buildEnv({ home, tmpdir, experiment = {} }) {
  const env = {
    HOME: home,
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    LANG: 'en_US.UTF-8',
    PATH: '/usr/bin:/bin',
    TMPDIR: tmpdir,
    ...experiment,
  };
  for (const name of Object.keys(env)) {
    if (!ENV_ALLOW.has(name) && !ENV_EXPERIMENT.has(name)) {
      throw new Error(`環境變數 ${name} 不在白名單`);
    }
    if (FORBIDDEN_ENV.test(name)) throw new Error(`環境變數 ${name} 屬於計費／金鑰類`);
  }
  return env;
}

/** 執行 claude；提示走 stdin。回傳 exit code、stdout、stderr。 */
export function runClaude({ args, env, cwd, stdin = '', timeoutMs = 120_000 }) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, env, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

/** 解析 stream-json（一行一個 JSON 事件）；壞行保留原文。 */
export function parseStream(stdout) {
  return stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'unparsed', raw: line };
      }
    });
}

/** 從事件串流抽出判定需要的欄位。 */
export function summarizeEvents(events) {
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init') ?? {};
  const result = events.find((e) => e.type === 'result') ?? {};
  const toolUses = [];
  let assistantText = '';
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    for (const block of e.message?.content ?? []) {
      if (block.type === 'tool_use') toolUses.push(block.name);
      if (block.type === 'text') assistantText += block.text;
    }
  }
  const hookEvents = events.filter(
    (e) => e.type === 'system' && String(e.subtype ?? '').startsWith('hook'),
  );
  const modelUsage = result.modelUsage ?? {};
  return {
    apiKeySource: init.apiKeySource,
    model: init.model,
    permissionMode: init.permissionMode,
    tools: init.tools,
    mcpServers: init.mcp_servers,
    plugins: init.plugins,
    skills: init.skills,
    agents: init.agents,
    slashCommandCount: init.slash_commands?.length,
    initKeys: Object.keys(init).sort(),
    toolUses,
    hookEventCount: hookEvents.length,
    resultSubtype: result.subtype,
    isError: result.is_error,
    apiErrorStatus: result.api_error_status,
    resultText: typeof result.result === 'string' ? result.result.slice(0, 400) : undefined,
    assistantText: assistantText.slice(0, 400),
    totalCostUsd: result.total_cost_usd,
    usage: result.usage
      ? {
          input: result.usage.input_tokens,
          cacheCreate: result.usage.cache_creation_input_tokens,
          cacheRead: result.usage.cache_read_input_tokens,
          output: result.usage.output_tokens,
        }
      : undefined,
    contextWindow: Object.fromEntries(
      Object.entries(modelUsage).map(([m, u]) => [m, u.contextWindow]),
    ),
    permissionDenials: result.permission_denials?.length,
  };
}

/** 在整份輸出（含 stderr）裡找誘餌標記。 */
export function findCanaries(text, canaries) {
  return canaries.filter((c) => text.includes(c));
}

/** 列出 markers 資料夾（hook／apiKeyHelper／MCP 誘餌被執行時會在這裡留檔）。 */
export async function listMarkers(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).sort();
}

/** 從 debug log 抽出提到 CLAUDE.md、settings、hooks、apiKeyHelper、MCP、OAuth 的行（截斷）。 */
export async function grepDebugLog(file, patterns) {
  if (!existsSync(file)) return { exists: false, hits: {} };
  const lines = (await readFile(file, 'utf8')).split('\n');
  const hits = {};
  for (const [name, re] of Object.entries(patterns)) {
    hits[name] = lines.filter((l) => re.test(l)).map((l) => l.slice(0, 240));
  }
  return { exists: true, lineCount: lines.length, hits };
}

/** 把家目錄路徑換成 ~，email、UUID（session id 等）也遮掉。 */
export function redactText(text) {
  return text
    .split(os.homedir())
    .join('~')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
}

/** 報告物件 → 遮蔽後的 JSON 文字。 */
export const redact = (value) => redactText(JSON.stringify(value, null, 2));

/** stream-json 原始輸出逐行遮蔽（保留一行一個事件的 JSONL 格式）。 */
export const redactJsonl = (stdout) => stdout.split('\n').map(redactText).join('\n');

/**
 * 判定 `claude auth status --json` 是否為訂閱登入（ADR-0002 執行前檢查）：
 * loggedIn、authMethod=claude.ai、apiProvider=firstParty，且沒有 apiKeySource。
 */
export function assessAuthStatus(stdout) {
  let status;
  try {
    status = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: 'auth status 輸出不是 JSON' };
  }
  if (status?.loggedIn !== true) return { ok: false, reason: '未登入' };
  if (status.authMethod !== 'claude.ai')
    return { ok: false, reason: `authMethod=${status.authMethod}` };
  if (status.apiProvider !== 'firstParty')
    return { ok: false, reason: `apiProvider=${status.apiProvider}` };
  if (status.apiKeySource !== undefined)
    return { ok: false, reason: `apiKeySource=${status.apiKeySource}` };
  return { ok: true, reason: `訂閱登入（${status.subscriptionType ?? '未知方案'}）` };
}

export const MANAGED_SETTINGS = '/Library/Application Support/ClaudeCode/managed-settings.json';

/**
 * 真實使用者設定下的訂閱檢查：真 HOME、空沙箱工作目錄跑 auth status（不打模型）。
 * 受管設定檔存在 → 無法確認，一律不通過。
 */
export async function preflightSubscription({
  run = runClaude,
  sandbox,
  managedSettings = MANAGED_SETTINGS,
}) {
  if (existsSync(managedSettings)) {
    return { ok: false, reason: `受管設定存在（${managedSettings}），無法確認計費路線` };
  }
  const env = buildEnv({ home: os.homedir(), tmpdir: sandbox.tmp });
  const res = await run({ args: ['auth', 'status', '--json'], env, cwd: sandbox.work });
  if (res.code !== 0) return { ok: false, reason: `auth status 結束碼 ${res.code}` };
  return assessAuthStatus(res.stdout);
}

export const isLive = () => process.argv.includes('--live');
