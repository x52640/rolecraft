import {
  CommandPolicyError,
  type CommandSpec,
  defineCommand,
  MODEL_SLOT,
} from '../core/command.ts';
import type { EnvironmentPolicy } from '../core/environment.ts';

/**
 * Claude CLI 的固定常數（ADR-0002 §1、§6）。命令列只有模型位置可變，不加任何其他旗標。
 */

/** ADR-0002 實測驗證過的 CLI 版本；實際版本不同時，旗標行為可能已變，需重跑 P1-T011 spike。 */
export const CLAUDE_VERIFIED_VERSION = '2.1.296';

/** 正式執行命令（提示走 stdin）。`--safe-mode` 與 `--setting-sources ""` 缺一不可。 */
export const CLAUDE_RUN_COMMAND: CommandSpec = defineCommand([
  '-p',
  '--model',
  MODEL_SLOT,
  '--output-format',
  'stream-json',
  '--verbose',
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  '',
  '--safe-mode',
  '--disable-slash-commands',
  '--no-chrome',
  '--no-session-persistence',
  '--permission-mode',
  'dontAsk',
]);

/** R6-1：官方工具自己回報登入方式（不打模型）。 */
export const CLAUDE_AUTH_STATUS_COMMAND: CommandSpec = defineCommand(['auth', 'status', '--json']);

export const CLAUDE_VERSION_COMMAND: CommandSpec = defineCommand(['--version']);

export const CLAUDE_COMMANDS: readonly CommandSpec[] = [
  CLAUDE_RUN_COMMAND,
  CLAUDE_AUTH_STATUS_COMMAND,
  CLAUDE_VERSION_COMMAND,
];

/**
 * 子程序環境：core 白名單（含真實 HOME；假 HOME／CLAUDE_CONFIG_DIR 會登出）＋固定 PATH。
 * 不額外放行任何 `CLAUDE_CODE_*`、`ANTHROPIC_*`（不在白名單就不會帶出）。
 */
export const CLAUDE_ENVIRONMENT: EnvironmentPolicy = Object.freeze({
  set: Object.freeze({ PATH: '/usr/bin:/bin' }),
});

/**
 * 禁用旗標（ADR-0002 §6）。命令列是固定陣列，這份給斷言用：出現就是程式錯誤。
 * 值固定的旗標（`--tools`、`--setting-sources`、`--permission-mode`）只准出現在 ALLOWED_VALUES 的值。
 */
export const CLAUDE_FORBIDDEN_FLAGS: readonly string[] = [
  '--bare',
  '--settings',
  '--mcp-config',
  '--plugin-dir',
  '--plugin-url',
  '--add-dir',
  '--agent',
  '--agents',
  '--allowedTools',
  '--allowed-tools',
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--chrome',
  '--ide',
  '--file',
  '--betas',
  '--continue',
  '-c',
  '--resume',
  '-r',
  '--fork-session',
  '--from-pr',
  '--teleport',
  '--cloud',
  '--remote-control',
  '--bg',
  '--worktree',
  '--tmux',
  '--desktop',
  '--environment',
  '--debug',
  '-d',
  '--debug-file',
];

const ALLOWED_VALUES: Readonly<Record<string, string>> = {
  '--tools': '',
  '--setting-sources': '',
  '--permission-mode': 'dontAsk',
};

/** 檢查命令沒有禁用旗標、值固定的旗標值正確。回傳問題清單（空＝通過）。 */
export function findForbiddenClaudeArgs(spec: CommandSpec): string[] {
  const problems: string[] = [];
  const args = spec.args;
  args.forEach((arg, index) => {
    if (typeof arg !== 'string') return;
    const flag = arg.split('=')[0] ?? arg;
    if (CLAUDE_FORBIDDEN_FLAGS.includes(flag)) problems.push(flag);
    const fixed = ALLOWED_VALUES[flag];
    if (fixed !== undefined) {
      const value = arg.includes('=') ? arg.slice(flag.length + 1) : args[index + 1];
      if (value !== fixed) problems.push(`${flag}（值不是固定值）`);
    }
  });
  return problems;
}

export function assertClaudeCommands(specs: readonly CommandSpec[]): void {
  const problems = specs.flatMap(findForbiddenClaudeArgs);
  if (problems.length > 0) {
    throw new CommandPolicyError(`Claude 命令含禁用旗標：${problems.join(', ')}`);
  }
}

// 模組載入時就斷言一次：常數若被改壞，整個適配器不能用。
assertClaudeCommands(CLAUDE_COMMANDS);

/**
 * 模型候選。CLI 沒有列出可用模型的指令（2.1.296 `--help` 只有 `--model`，說明舉例
 * 'fable'、'opus'、'sonnet'；haiku 在 ADR-0002 實測可用），所以只能給 CLI 認得的別名當候選，
 * 選定前以一次極短呼叫驗證（verifyClaudeModel），失敗就不列為可用。
 */
export const CLAUDE_MODEL_CANDIDATES: readonly string[] = ['haiku', 'sonnet', 'opus', 'fable'];

/** 受管設定（MDM）：`--setting-sources` 與 safe-mode 都擋不住，存在就標「無法確認」。 */
export const CLAUDE_MANAGED_SETTINGS_PATHS: readonly string[] = [
  '/Library/Application Support/ClaudeCode/managed-settings.json',
  '/Library/Application Support/ClaudeCode/managed-settings.d',
  '/Library/Application Support/ClaudeCode/managed-mcp.json',
];

/** 執行中 rate_limit_event.status 視為「仍可用」的值；其他一律視為額度用完（R9，不重試）。 */
export const CLAUDE_RATE_LIMIT_OK: readonly string[] = ['allowed', 'allowed_warning'];

/**
 * 自動重新驗證（D22）每次啟動 CLI 的執行逾時。逾時就中止並終止整個行程群組，
 * 該次重新驗證記為失敗，避免卡在「重新驗證中」。
 */
export const CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS = 120_000;
