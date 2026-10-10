import { basename, isAbsolute } from 'node:path';

import type { Provider } from '@rolecraft/contracts';

/**
 * 子程序命令（D6、R5、R6-3）。
 *
 * - 參數陣列只由程式常數組成；唯一的變數是模型 ID，用 MODEL_SLOT 佔位並嚴格驗證格式。
 * - 提示內容只走 stdin，永遠不進參數陣列。
 * - 只能用 defineCommand 建立：型別上拒絕寬型別與含 `${string}`／`${number}` 插值的樣板型別；
 *   ESLint（eslint.config.js）禁止引數含運算式的樣板字串或非字面量元素；執行時用登記表確認來源。
 *   型別與 lint 都只是第一道防線（`as` 轉型可繞過），真正的保證是「參數只來自程式常數」的審查。
 */

/** 模型 ID 佔位。 */
export const MODEL_SLOT: unique symbol = Symbol('rolecraft.model');
export type ModelSlot = typeof MODEL_SLOT;

export type CommandArg = string | ModelSlot;

export interface CommandSpec {
  readonly args: readonly CommandArg[];
}

/**
 * S 是否為純字面值（聯集時每個成員都要是）。
 * 用「`{}` 能否指派給 Record<S, 1>」判斷：寬型別 string 與 `${string}`／`${number}`／`${bigint}`／
 * Uppercase<string> 等樣板型別會變成索引簽章（`{}` 可指派），純字面值則是必填屬性（不可指派）。
 */
type IsUnitLiteral<S extends string> = S extends unknown
  ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} extends Record<S, 1>
    ? false
    : true
  : never;
type IsPureLiteral<S extends string> = false extends IsUnitLiteral<S> ? false : true;

/** 型別層只接受純字面值與 MODEL_SLOT；拒絕寬型別 string（變數、外部內容）與含插值的樣板型別。 */
type LiteralArgs<T extends readonly CommandArg[]> = {
  readonly [K in keyof T]: T[K] extends ModelSlot
    ? T[K]
    : T[K] extends string
      ? IsPureLiteral<T[K]> extends true
        ? T[K]
        : never
      : never;
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

/**
 * 不得當成執行檔的通用直譯器／轉手程式（basename，不分大小寫，忽略版本尾碼如 bash5、node24）。
 * 這些會把參數當程式碼或另一個命令執行，等於繞過「參數只由常數組成」。
 */
export const FORBIDDEN_INTERPRETERS: readonly string[] = [
  'sh',
  'bash',
  'zsh',
  'dash',
  'fish',
  'ksh',
  'csh',
  'tcsh',
  'env',
  'node',
];

/** 執行檔路徑：必須是絕對路徑、不含控制字元，且不是通用直譯器。 */
export function assertExecutablePath(path: string): void {
  // eslint-disable-next-line no-control-regex
  if (!isAbsolute(path) || /[\u0000-\u001f]/.test(path)) {
    throw new CommandPolicyError('執行檔必須是絕對路徑且不含控制字元');
  }
  const name = basename(path)
    .toLowerCase()
    .replace(/[\d.-]+$/, '');
  if (FORBIDDEN_INTERPRETERS.includes(name)) {
    throw new CommandPolicyError('執行檔不得是 shell 或通用直譯器');
  }
}
