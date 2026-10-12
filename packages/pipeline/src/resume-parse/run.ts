/**
 * 履歷 AI 整理送出（P1-T069）：經呼叫端的 execute（應是 providers 的訂閱檢查包裝，R5、R6 每次重做）送出一次，
 * R6 紀錄一律交 recordRunCheck。輸出先驗格式（整份不合格就失敗、不自動重試），再逐欄照抄檢查（check.ts），
 * 不符的欄位丟棄並記原因。姓名與聯絡資料由本機抽出（prepare 時），不經過模型。本模組不寫入任何資料。
 * 通過檢查的草稿序列化後 UTF-8 超過 512 KiB 整份判失敗（invalid_output；D28 W3，PDF 與網頁共用）。
 * 量測時不算 D30 的額外出處（moreLines／moreBlockIds），維持原判定；通過後連同額外出處超過上限，
 * 就拿掉額外出處再回傳（回應仍在上限內；出處原文因此只剩第一個引用來源，P1-T090 審查）。
 */
import {
  IMPORT_AI_DRAFT_MAX_BYTES,
  utf8ByteLength,
  type ImportAiDraft,
  type ImportAiFailure,
  type ImportWebAiDraft,
  type Provider,
  type RunCheckRecord,
} from '@rolecraft/contracts';
import type { RunOutcome } from '@rolecraft/providers';

import { checkResumeParse } from './check.ts';
import { parseResumeParseOutput, type ResumeParseSource } from './output.ts';
import type { PreparedResumeParse } from './prepare.ts';
import type { ResumeParseOutput } from './types.ts';
import { checkWebResumeParse } from './web-check.ts';
import type { PreparedWebResumeParse } from './web-prepare.ts';

export interface RunResumeParseDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly signal: S;
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
}

type RunResult<D> =
  | { readonly ok: true; readonly draft: D }
  | { readonly ok: false; readonly failure: ImportAiFailure };

export type ResumeParseRunResult = RunResult<ImportAiDraft>;
export type WebResumeParseRunResult = RunResult<ImportWebAiDraft>;

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

/** 草稿序列化後 UTF-8 是否在上限內（模型可以重複照抄同一個來源；W3）。 */
export function draftFitsLimit(draft: unknown): boolean {
  return utf8ByteLength(JSON.stringify(draft)) <= IMPORT_AI_DRAFT_MAX_BYTES;
}

/** D30 的額外出處欄位：只供確認匯入時取完整出處原文，不算進草稿大小判定。 */
const EXTRA_SOURCE_KEYS: ReadonlySet<string> = new Set(['moreLines', 'moreBlockIds']);

/** 拿掉所有額外出處欄位（其餘不變）。 */
export function withoutExtraSources<D>(draft: D): D {
  const json = JSON.stringify(draft, (key, value: unknown) =>
    EXTRA_SOURCE_KEYS.has(key) ? undefined : value,
  );
  return JSON.parse(json) as D;
}

/** 大小判定（不算額外出處）；通過但連同額外出處超過上限時回拿掉額外出處的版本，不通過回 null。 */
function sizedDraft<D>(draft: D): D | null {
  const base = withoutExtraSources(draft);
  if (!draftFitsLimit(base)) return null;
  return draftFitsLimit(draft) ? draft : base;
}

/** 送出一次並驗格式；通過的輸出交給 build 檢查，草稿超過上限整份判失敗。 */
async function runOnce<S, D>(
  prompt: string,
  source: ResumeParseSource,
  deps: RunResumeParseDeps<S>,
  build: (output: ResumeParseOutput) => D,
): Promise<RunResult<D>> {
  const outcome = await deps.execute({ prompt, signal: deps.signal });
  await deps.recordRunCheck(outcome.record);
  if (outcome.record.provider !== deps.provider || outcome.record.model !== deps.model) {
    throw new Error('執行紀錄的服務或模型與請求不符');
  }
  if (outcome.status === 'blocked') return { ok: false, failure: 'run_check_failed' };
  const failure = providerFailure(outcome);
  if (failure !== null || !outcome.result.ok) {
    return { ok: false, failure: failure ?? 'provider_error' };
  }
  const parsed = parseResumeParseOutput(outcome.result.text, source);
  if (!parsed.ok) return { ok: false, failure: 'invalid_output' };
  const draft = sizedDraft(build(parsed.output));
  return draft === null ? { ok: false, failure: 'invalid_output' } : { ok: true, draft };
}

export function runResumeParse<S>(
  prepared: PreparedResumeParse,
  deps: RunResumeParseDeps<S>,
): Promise<ResumeParseRunResult> {
  return runOnce(prepared.prompt, 'pdf', deps, (output) => ({
    personalInfo: [...prepared.personalInfo],
    ...checkResumeParse(output, { lines: prepared.lines, tokens: prepared.tokens }),
  }));
}

/** 網頁來源（D28）：來源編號必須是區塊編號，照抄檢查以區塊為單位。 */
export function runWebResumeParse<S>(
  prepared: PreparedWebResumeParse,
  deps: RunResumeParseDeps<S>,
): Promise<WebResumeParseRunResult> {
  return runOnce(prepared.prompt, 'web', deps, (output) => ({
    personalInfo: [...prepared.personalInfo],
    ...checkWebResumeParse(output, { lines: prepared.lines, tokens: prepared.tokens }),
  }));
}
