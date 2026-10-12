// AI 整理的兩種來源（PDF：P1-T069；網頁區塊：P1-T080、D28）：送出前在本機準備（遮蔽姓名與聯絡資料、
// 預算檢查），任何一項不成立就回原因、不呼叫模型。網頁來源送出的內容只來自 prepareWebResumeParse 的提示，
// 這裡不另外拼接原文；網址與 nameText 不在輸入裡。
import type { InputBudget } from '@rolecraft/domain';
import type { ImportAiFailure, ImportAiParseView } from '@rolecraft/contracts';
import {
  prepareResumeParse,
  prepareWebResumeParse,
  runResumeParse,
  runWebResumeParse,
  type RunResumeParseDeps,
  type WebResumeParseInputs,
  type WebResumeParsePrepareFailure,
} from '@rolecraft/pipeline';

import type { AiSource } from './ai-runner.ts';
import type { AiParseRefusal } from './service.ts';

/** 要整理的來源：PDF 解析出的行，或網頁擷取的區塊＋四個姓名來源。 */
export type AiJob =
  { kind: 'pdf'; source: AiSource } | { kind: 'web'; inputs: WebResumeParseInputs };

/** 準備好、可以送出的一次整理。 */
export interface PreparedJob {
  readonly running: ImportAiParseView;
  run(deps: RunResumeParseDeps<AbortSignal>): Promise<ImportAiParseView>;
  failed(failure: ImportAiFailure): ImportAiParseView;
}

export type PrepareJobResult =
  { ok: true; job: PreparedJob } | { ok: false; reason: AiParseRefusal };

/** 網頁來源的準備失敗 → 服務的拒絕原因（附註 2：姓名欄位過多不可當成需確認姓名）。 */
const WEB_REFUSALS: Record<WebResumeParsePrepareFailure, AiParseRefusal> = {
  name_unconfirmed: 'name_required',
  name_parts_over_limit: 'name_parts_over_limit',
  no_text: 'no_text',
  over_budget: 'over_budget',
};

function pdfJob(source: AiSource, budget: InputBudget, newId: () => string): PrepareJobResult {
  const inputs = { pages: source.pages, names: source.names, personalHints: source.hints };
  const prepared = prepareResumeParse(inputs, budget, newId);
  if (!prepared.ok) return { ok: false, reason: prepared.reason };
  const failed = (failure: ImportAiFailure): ImportAiParseView => ({
    state: 'failed',
    failure,
    draft: null,
  });
  return {
    ok: true,
    job: {
      running: { state: 'running', failure: null, draft: null },
      failed,
      run: async (deps) => {
        const result = await runResumeParse(prepared.prepared, deps);
        return result.ok
          ? { state: 'succeeded', failure: null, draft: result.draft }
          : failed(result.failure);
      },
    },
  };
}

function webJob(
  inputs: WebResumeParseInputs,
  budget: InputBudget,
  newId: () => string,
): PrepareJobResult {
  const prepared = prepareWebResumeParse(inputs, budget, newId);
  if (!prepared.ok) return { ok: false, reason: WEB_REFUSALS[prepared.reason] };
  const base = { draft: null, source: 'web' } as const;
  const failed = (failure: ImportAiFailure): ImportAiParseView => ({
    ...base,
    state: 'failed',
    failure,
    webDraft: null,
  });
  return {
    ok: true,
    job: {
      running: { ...base, state: 'running', failure: null, webDraft: null },
      failed,
      run: async (deps) => {
        const result = await runWebResumeParse(prepared.prepared, deps);
        return result.ok
          ? { ...base, state: 'succeeded', failure: null, webDraft: result.draft }
          : failed(result.failure);
      },
    },
  };
}

export function prepareJob(job: AiJob, budget: InputBudget, newId: () => string): PrepareJobResult {
  return job.kind === 'pdf' ? pdfJob(job.source, budget, newId) : webJob(job.inputs, budget, newId);
}
