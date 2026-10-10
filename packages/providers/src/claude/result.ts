import type { ExecutionResult, ProviderError, ProviderErrorKind } from '../core/adapter.ts';
import type { ProcessOutput } from '../core/process.ts';
import { type AcceptVersion, acceptBaselineVersion, inspectStdout } from './stream.ts';

/**
 * 執行結束後的判定（ADR-0002 §3、§4）。失敗看 `is_error`／`api_error_status`，不只看 subtype
 * （無效 key 時 subtype 仍是 success）。隔離違規一律丟棄輸出，不回傳任何模型文字。
 */

/** 每次執行的附帶資訊（R8 上下文上限、R9 額度狀態）；不含模型文字。 */
export interface ClaudeRunInfo {
  readonly cliVersion: string | null;
  readonly model: string | null;
  /** result.modelUsage.<模型>.contextWindow */
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  /** 最後一個 rate_limit_event 的 status */
  readonly rateLimitStatus: string | null;
}

export interface ClaudeRunAnalysis {
  readonly result: ExecutionResult;
  readonly info: ClaudeRunInfo;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (kind: ProviderErrorKind, message: string): ExecutionResult => ({
  ok: false,
  error: { kind, message } satisfies ProviderError,
});

const QUOTA_TEXT = /usage limit|rate[_ ]limit|weekly limit|limit reached|out of (extra )?usage/i;

/** result 事件是錯誤時的分類。429／額度字樣 → 額度；5xx／529 → 暫時性；其他（含 401）→ other。 */
export function classifyResultError(event: Json): ExecutionResult | null {
  const status = event['api_error_status'];
  const isError = event['is_error'] === true || (status !== undefined && status !== null);
  const subtype = String(event['subtype']);
  if (!isError && subtype === 'success') return null;
  const text = typeof event['result'] === 'string' ? event['result'] : '';
  const code = typeof status === 'number' ? status : null;
  const detail = `${subtype}${code === null ? '' : `／HTTP ${code}`}`;
  if (code === 429 || QUOTA_TEXT.test(text)) {
    return fail('quota_exhausted', `Claude 額度已用完，請等重置後手動續跑（${detail}）`);
  }
  if (code === 401 || code === 403) {
    return fail('other', `Claude 登入或授權失敗（${detail}）`);
  }
  if (code !== null && (code >= 500 || code === 408)) {
    return fail('transient', `Claude 服務暫時錯誤（${detail}）`);
  }
  return fail('other', `Claude 執行失敗（${detail}）`);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collectInfo(events: readonly Json[]): ClaudeRunInfo {
  let cliVersion: string | null = null;
  let model: string | null = null;
  let contextWindow: number | null = null;
  let maxOutputTokens: number | null = null;
  let rateLimitStatus: string | null = null;
  for (const event of events) {
    if (event['type'] === 'system' && event['subtype'] === 'init') {
      if (typeof event['claude_code_version'] === 'string')
        cliVersion = event['claude_code_version'];
      if (typeof event['model'] === 'string') model = event['model'];
    }
    if (event['type'] === 'rate_limit_event' && isObject(event['rate_limit_info'])) {
      const status = event['rate_limit_info']['status'];
      if (typeof status === 'string') rateLimitStatus = status;
    }
    if (event['type'] === 'result' && isObject(event['modelUsage'])) {
      const usage = Object.values(event['modelUsage']).find(isObject);
      if (usage) {
        contextWindow = numberOrNull(usage['contextWindow']);
        maxOutputTokens = numberOrNull(usage['maxOutputTokens']);
      }
    }
  }
  return { cliVersion, model, contextWindow, maxOutputTokens, rateLimitStatus };
}

/** 判定一次執行的輸出。 */
export function analyzeRun(
  output: ProcessOutput,
  acceptVersion: AcceptVersion = acceptBaselineVersion,
): ClaudeRunAnalysis {
  const inspector = inspectStdout(output.stdout, acceptVersion);
  const info = collectInfo(inspector.events);
  const done = (result: ExecutionResult): ClaudeRunAnalysis => ({ result, info });

  // 隔離違規優先於取消：即使使用者剛好取消，也要記成隔離失效、丟棄輸出。
  const violation = inspector.violation;
  if (violation?.kind === 'isolation') {
    return done(fail('other', `隔離檢查失敗，已終止並丟棄輸出：${violation.reason}`));
  }
  if (violation?.kind === 'quota') {
    return done(
      fail('quota_exhausted', `Claude 額度已用完，請等重置後手動續跑（${violation.reason}）`),
    );
  }
  if (output.aborted) return done(fail('cancelled', '使用者已取消'));
  if (output.truncated) return done(fail('other', 'Claude 輸出超過上限，已終止'));
  if (inspector.events.length === 0) {
    return done(fail('other', `Claude 沒有輸出事件（結束碼 ${String(output.exitCode)}）`));
  }

  const results = inspector.events.filter((e) => e['type'] === 'result');
  const last = results.at(-1);
  if (!last) {
    return done(fail('other', `Claude 未回報結果（結束碼 ${String(output.exitCode)}）`));
  }
  const error = classifyResultError(last);
  if (error) return done(error);
  if (output.exitCode !== 0) {
    return done(fail('other', `Claude 結束碼 ${String(output.exitCode)}`));
  }
  const text = last['result'];
  if (typeof text !== 'string') return done(fail('other', 'Claude 結果沒有文字'));
  return done({ ok: true, text });
}
