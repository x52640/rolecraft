import { CLAUDE_RATE_LIMIT_OK, CLAUDE_VERIFIED_VERSION } from './constants.ts';

/**
 * stream-json 事件檢查（ADR-0002 §6「執行中」）。同一份邏輯給兩處用：
 * 執行中的串流守門（看到違規立刻終止子程序）與結束後的整體判定（違規就丟棄輸出）。
 */

/** 違規種類：isolation＝隔離失效（init 異常、工具呼叫）；quota＝額度用完（R9，不重試）。 */
export interface StreamViolation {
  readonly kind: 'isolation' | 'quota';
  readonly reason: string;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length === 0;

/** 接受哪些 CLI 版本（init 的 claude_code_version）；預設只有 ADR-0002 驗證版本。 */
export type AcceptVersion = (version: string) => boolean;

export const acceptBaselineVersion: AcceptVersion = (version) =>
  version === CLAUDE_VERIFIED_VERSION;

/** init 事件的隔離條件；回傳問題清單（空＝通過）。 */
export function checkInit(
  event: Json,
  acceptVersion: AcceptVersion = acceptBaselineVersion,
): string[] {
  const problems: string[] = [];
  if (event['type'] !== 'system' || event['subtype'] !== 'init') {
    return ['第一個事件不是 system/init'];
  }
  if (event['apiKeySource'] !== 'none') {
    problems.push(`apiKeySource 不是 none（${String(event['apiKeySource'])}）`);
  }
  if (!isEmptyArray(event['tools'])) problems.push('tools 不是空的');
  if (!isEmptyArray(event['mcp_servers'])) problems.push('mcp_servers 不是空的');
  const plugins = event['plugins'];
  if (plugins !== undefined) {
    const ok =
      Array.isArray(plugins) && plugins.every((p) => isObject(p) && p['path'] === 'builtin');
    if (!ok) problems.push('載入了非內建外掛');
  }
  for (const key of ['skills', 'slash_commands']) {
    if (event[key] !== undefined && !isEmptyArray(event[key])) problems.push(`${key} 不是空的`);
  }
  const version = event['claude_code_version'];
  if (typeof version !== 'string' || !acceptVersion(version)) {
    problems.push(`CLI 版本 ${String(version)} 不是已驗證版本`);
  }
  return problems;
}

const TOOL_BLOCK = /tool_use$|tool_result$/;

function contentHasTool(message: unknown): boolean {
  if (!isObject(message)) return false;
  const content = message['content'];
  return (
    Array.isArray(content) &&
    content.some((block) => isObject(block) && TOOL_BLOCK.test(String(block['type'])))
  );
}

/** 任何工具呼叫、工具結果、權限拒絕、hook 事件都算（ADR-0002：任何 tool_use → 終止、丟棄）。 */
export function toolEventReason(event: Json): string | null {
  const type = String(event['type']);
  const subtype = String(event['subtype']);
  if (/tool/i.test(type)) return `出現工具事件（${type}）`;
  if (type === 'system' && (subtype === 'permission_denied' || subtype.startsWith('hook'))) {
    return `出現 ${subtype} 事件`;
  }
  if ((type === 'assistant' || type === 'user') && contentHasTool(event['message'])) {
    return '出現工具呼叫或工具結果';
  }
  if (type === 'result' && !isEmptyArray(event['permission_denials'] ?? [])) {
    return 'result 含 permission_denials';
  }
  return null;
}

function rateLimitReason(event: Json): string | null {
  if (event['type'] !== 'rate_limit_event') return null;
  const info = event['rate_limit_info'];
  const status = isObject(info) ? info['status'] : undefined;
  if (typeof status === 'string' && CLAUDE_RATE_LIMIT_OK.includes(status)) return null;
  return `額度狀態 ${String(status)}`;
}

/** 逐行檢查串流；第一個違規之後的行不再檢查（呼叫端應立即終止）。 */
export class StreamInspector {
  private readonly acceptVersion: AcceptVersion;
  private seenFirst = false;
  private violationValue: StreamViolation | null = null;
  readonly events: Json[] = [];

  constructor(acceptVersion: AcceptVersion = acceptBaselineVersion) {
    this.acceptVersion = acceptVersion;
  }

  get violation(): StreamViolation | null {
    return this.violationValue;
  }

  /** 處理一行；回傳本行造成的違規（或先前已有的違規）。 */
  push(line: string): StreamViolation | null {
    if (this.violationValue || line.trim() === '') return this.violationValue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return this.fail('isolation', '串流含非 JSON 行，無法確認隔離');
    }
    if (!isObject(event)) return this.fail('isolation', '串流事件格式不合法');
    this.events.push(event);
    if (!this.seenFirst) {
      this.seenFirst = true;
      const problems = checkInit(event, this.acceptVersion);
      if (problems.length > 0) return this.fail('isolation', `init 異常：${problems.join('；')}`);
      return null;
    }
    const tool = toolEventReason(event);
    if (tool) return this.fail('isolation', tool);
    const quota = rateLimitReason(event);
    if (quota) return this.fail('quota', quota);
    return null;
  }

  private fail(kind: StreamViolation['kind'], reason: string): StreamViolation {
    this.violationValue = { kind, reason };
    return this.violationValue;
  }
}

/** 把一整段 stdout 跑過檢查器（結束後判定用）。 */
export function inspectStdout(
  stdout: string,
  acceptVersion: AcceptVersion = acceptBaselineVersion,
): StreamInspector {
  const inspector = new StreamInspector(acceptVersion);
  for (const line of stdout.split('\n')) {
    if (inspector.push(line)) break;
  }
  return inspector;
}
