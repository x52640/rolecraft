/**
 * 履歷 AI 整理送出（P1-T069）：經呼叫端的 execute（應是 providers 的訂閱檢查包裝，R5、R6 每次重做）送出一次，
 * R6 紀錄一律交 recordRunCheck。輸出先驗格式（整份不合格就失敗、不自動重試），再逐欄照抄檢查（check.ts），
 * 不符的欄位丟棄並記原因。姓名與聯絡資料由本機抽出（prepare 時），不經過模型。本模組不寫入任何資料。
 */
import type {
  ImportAiDraft,
  ImportAiFailure,
  Provider,
  RunCheckRecord,
} from '@rolecraft/contracts';
import type { RunOutcome } from '@rolecraft/providers';

import { checkResumeParse } from './check.ts';
import { parseResumeParseOutput } from './output.ts';
import type { PreparedResumeParse } from './prepare.ts';

export interface RunResumeParseDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly signal: S;
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
}

export type ResumeParseRunResult =
  | { readonly ok: true; readonly draft: ImportAiDraft }
  | { readonly ok: false; readonly failure: ImportAiFailure };

function providerFailure(
  outcome: Exclude<RunOutcome, { status: 'blocked' }>,
): ImportAiFailure | null {
  if (outcome.status === 'cancelled') return 'cancelled';
  if (outcome.result.ok) return null;
  switch (outcome.result.error.kind) {
    case 'quota_exhausted':
      return 'quota_exhausted';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'provider_error';
  }
}

export async function runResumeParse<S>(
  prepared: PreparedResumeParse,
  deps: RunResumeParseDeps<S>,
): Promise<ResumeParseRunResult> {
  const outcome = await deps.execute({ prompt: prepared.prompt, signal: deps.signal });
  await deps.recordRunCheck(outcome.record);
  if (outcome.record.provider !== deps.provider || outcome.record.model !== deps.model) {
    throw new Error('執行紀錄的服務或模型與請求不符');
  }
  if (outcome.status === 'blocked') return { ok: false, failure: 'run_check_failed' };
  const failure = providerFailure(outcome);
  if (failure !== null || !outcome.result.ok) {
    return { ok: false, failure: failure ?? 'provider_error' };
  }
  const parsed = parseResumeParseOutput(outcome.result.text);
  if (!parsed.ok) return { ok: false, failure: 'invalid_output' };
  const checked = checkResumeParse(parsed.output, {
    lines: prepared.lines,
    tokens: prepared.tokens,
  });
  return { ok: true, draft: { personalInfo: [...prepared.personalInfo], ...checked } };
}
