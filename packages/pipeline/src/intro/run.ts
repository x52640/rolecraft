/**
 * 投遞自介送出（D25）：經呼叫端的 execute（應是 providers 的訂閱檢查包裝，R5、R6 每次重做）送出一次，
 * R6 紀錄一律交 recordRunCheck。輸出先驗格式、再過自介檢查（check.ts），任一不合整份不採用、不修補。
 * 不自動重試：使用者看到原因後可改寫或重新產生。本模組不寫入任何資料，也沒有任何送出訊息的功能（D7）。
 * 格式合格但檢查不通過時，另回草稿（文字、存在的引用、問題與問題片段，P1-T071），由呼叫端保留給使用者看。
 */
import type {
  ClaimCitation,
  IntroGenerationFailure,
  IntroProblem,
  Provider,
  RunCheckRecord,
} from '@rolecraft/contracts';
import type { RunOutcome } from '@rolecraft/providers';

import {
  checkModelIntro,
  introProblemFragments,
  lenientIntroLabels,
  resolveIntroLabels,
} from './check.ts';
import { parseIntroOutput } from './output.ts';
import type { PreparedIntro } from './prepare.ts';
import type { IntroDraftContent } from './types.ts';

export interface RunIntroDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly signal: S;
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
}

export type IntroRunResult =
  | { readonly ok: true; readonly text: string; readonly citations: readonly ClaimCitation[] }
  | {
      readonly ok: false;
      readonly failure: IntroGenerationFailure;
      /** 只有 failure 為 check_failed 時有值 */
      readonly problem: IntroProblem | null;
      /** 只有 failure 為 check_failed 時有值：沒通過的草稿（P1-T071） */
      readonly draft: IntroDraftContent | null;
    };

function failed(failure: IntroGenerationFailure) {
  return { ok: false, failure, problem: null, draft: null } as const;
}

function checkFailed(draft: IntroDraftContent) {
  return { ok: false, failure: 'check_failed', problem: draft.problem, draft } as const;
}

function providerFailure(
  outcome: Exclude<RunOutcome, { status: 'blocked' }>,
): IntroGenerationFailure | null {
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

export async function runIntro<S>(
  prepared: PreparedIntro,
  deps: RunIntroDeps<S>,
): Promise<IntroRunResult> {
  const outcome = await deps.execute({ prompt: prepared.prompt, signal: deps.signal });
  await deps.recordRunCheck(outcome.record);
  if (outcome.record.provider !== deps.provider || outcome.record.model !== deps.model) {
    throw new Error('執行紀錄的服務或模型與請求不符');
  }
  if (outcome.status === 'blocked') return failed('run_check_failed');
  const failure = providerFailure(outcome);
  if (failure !== null || !outcome.result.ok) return failed(failure ?? 'provider_error');
  const parsed = parseIntroOutput(outcome.result.text);
  if (!parsed.ok) return failed('invalid_output');
  const text = parsed.output.intro;
  const context = {
    claims: prepared.claims,
    profile: prepared.profile,
    jobNames: prepared.jobNames,
  };
  const resolved = resolveIntroLabels(parsed.output, prepared.claims);
  if (!resolved.ok) {
    const citations = lenientIntroLabels(parsed.output, prepared.claims);
    return checkFailed({ text, citations, problem: resolved.problem, fragments: [] });
  }
  // 模型產生的內容：承諾字眼也整份不採用（D25）
  const problem = checkModelIntro(text, resolved.citations, context);
  if (problem) {
    const fragments = introProblemFragments(text, resolved.citations, context, problem);
    return checkFailed({ text, citations: resolved.citations, problem, fragments });
  }
  return { ok: true, text, citations: resolved.citations };
}
