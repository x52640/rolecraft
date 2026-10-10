import { isAbsolute } from 'node:path';

import type { Provider } from '@rolecraft/contracts';

/**
 * 子程序命令（D6、R5、R6-3）。
 *
 * - 參數陣列只由程式常數組成；唯一的變數是模型 ID，用 MODEL_SLOT 佔位並嚴格驗證格式。
 * - 提示內容只走 stdin，永遠不進參數陣列。
 * - 只能用 defineCommand 建立（型別上拒絕非字面值字串；執行時用登記表確認來源）。
 */

/** 模型 ID 佔位。 */
export const MODEL_SLOT: unique symbol = Symbol('rolecraft.model');
export type ModelSlot = typeof MODEL_SLOT;

export type CommandArg = string | ModelSlot;

export interface CommandSpec {
  readonly args: readonly CommandArg[];
}

/** 型別層拒絕寬型別 `string`（例如變數、外部內容），只接受字面值與 MODEL_SLOT。 */
type LiteralArgs<T extends readonly CommandArg[]> = {
  readonly [K in keyof T]: T[K] extends ModelSlot ? T[K] : string extends T[K] ? never : T[K];
};

const registered = new WeakSet<CommandSpec>();

export class CommandPolicyError extends Error {
  override readonly name = 'CommandPolicyError';
}

/**
 * 會改走 API key 計費的執行模式旗標，依供應商集中列出（R6-3）。
 * 來源：claude 2.1.296 `--help`：`--bare` 只讀 ANTHROPIC_API_KEY 或 apiKeyHelper、不讀 OAuth 登入。
 * codex、antigravity 尚未查證（P1-T011 補；未查證前不代表允許任意旗標，適配器須自行回報 executionMode）。
 */
export const API_KEY_MODE_FLAGS: Readonly<Record<Provider, readonly string[]>> = {
  claude: ['--bare'],
  codex: [],
  antigravity: [],
};

/** 參數是否為（或以 `=` 帶值的）禁用旗標。 */
export function findApiKeyModeFlags(provider: Provider, spec: CommandSpec): string[] {
  const flags = API_KEY_MODE_FLAGS[provider];
  return spec.args.filter(
    (arg): arg is string =>
      typeof arg === 'string' && flags.some((f) => arg === f || arg.startsWith(`${f}=`)),
  );
}

/** 建立命令（只接受常數）。 */
export function defineCommand<const T extends readonly CommandArg[]>(
  args: LiteralArgs<T>,
): CommandSpec {
  const list: CommandArg[] = [];
  for (const arg of args as readonly unknown[]) {
    if (arg === MODEL_SLOT) {
      list.push(MODEL_SLOT);
    } else if (typeof arg === 'string' && !arg.includes('\0')) {
      list.push(arg);
    } else {
      throw new CommandPolicyError('命令參數只能是字串常數或 MODEL_SLOT');
    }
  }
  const spec: CommandSpec = Object.freeze({ args: Object.freeze(list) });
  registered.add(spec);
  return spec;
}

/**
 * 模型 ID 格式：英數開頭，只含英數與 `. _ : / @ [ ] -`，最長 128。
 * 不得以 `-` 開頭（避免被當成旗標）；不得含空白、引號或 shell 特殊字元。
 */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,127}$/;

export function isValidModelId(model: string): boolean {
  return MODEL_ID.test(model);
}

/** 把命令展開成參數陣列。命令必須來自 defineCommand；模型 ID 必須通過格式檢查。 */
export function buildArgv(spec: CommandSpec, model: string | undefined): string[] {
  if (!registered.has(spec)) {
    throw new CommandPolicyError('命令必須由 defineCommand 建立');
  }
  return spec.args.map((arg) => {
    if (arg !== MODEL_SLOT) return arg;
    if (model === undefined || !isValidModelId(model)) {
      throw new CommandPolicyError('模型 ID 缺少或格式不合法');
    }
    return model;
  });
}

/** 執行檔路徑：必須是絕對路徑、不含控制字元。 */
export function assertExecutablePath(path: string): void {
  // eslint-disable-next-line no-control-regex
  if (!isAbsolute(path) || /[\u0000-\u001f]/.test(path)) {
    throw new CommandPolicyError('執行檔必須是絕對路徑且不含控制字元');
  }
}
