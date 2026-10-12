/**
 * 專案分組建議（D23；P1-T063）：把已授權文件的摘要與相對名稱交給模型，取回「怎麼分專案」的建議。
 * 建議只是建議：本模組不建立專案、不寫入任何資料；由使用者確認後才建立（helper claims.create_projects）。
 *
 * 1. prepareGrouping：組提示並檢查輸入預算（R8），超過就不送出。沒有文件也不送出。
 * 2. runGrouping：經呼叫端的 execute（應是 providers 的訂閱檢查包裝，R5、R6 每次重做）送出一次，
 *    R6 紀錄一律交 recordRunCheck；輸出整份驗證，不合格不採用。不自動重試（使用者可再按一次）。
 */
import type { Id, Provider, RunCheckRecord } from '@rolecraft/contracts';
import { estimateTokens, type InputBudget } from '@rolecraft/domain';
import type { RunOutcome } from '@rolecraft/providers';

import { chooseBoundary } from '../prompts/analysis-prompt.ts';
import {
  buildGroupingPrompt,
  documentNameOf,
  groupingPromptData,
  type GroupingPromptDocument,
} from '../prompts/project-prompt.ts';
import { parseGroupingOutput } from './output.ts';

/** 一份可分組的文件：來源文件 ID（只留在本機，不送進提示）、相對名稱、摘要。 */
export interface GroupingDocument {
  readonly sourceDocumentId: Id;
  /** 文件在授權資料夾內的相對路徑（SourceDocument.documentPath）；送出前會清理 */
  readonly relPath: string;
  readonly summary: string;
}

export interface SuggestedDocumentRef {
  readonly sourceDocumentId: Id;
  readonly name: string;
}

export interface ProjectGroupSuggestion {
  readonly name: string;
  readonly documents: readonly SuggestedDocumentRef[];
}

export interface PreparedGrouping {
  readonly prompt: string;
  readonly estimatedTokens: number;
  /** 本機編號 → 文件 */
  readonly documents: ReadonlyMap<string, SuggestedDocumentRef>;
}

export type PrepareGroupingResult =
  | { readonly ok: true; readonly prepared: PreparedGrouping }
  | { readonly ok: false; readonly reason: 'no_documents' | 'over_budget' };

export type GroupingFailure =
  'run_check_failed' | 'provider_error' | 'invalid_output' | 'quota_exhausted' | 'cancelled';

export type GroupingResult =
  | {
      readonly ok: true;
      readonly groups: readonly ProjectGroupSuggestion[];
      readonly ungrouped: readonly SuggestedDocumentRef[];
    }
  | { readonly ok: false; readonly reason: GroupingFailure };

export function prepareGrouping(
  input: readonly GroupingDocument[],
  budget: InputBudget,
  newId: () => string,
): PrepareGroupingResult {
  if (input.length === 0) return { ok: false, reason: 'no_documents' };
  const promptDocs: GroupingPromptDocument[] = input.map((doc, i) => ({
    label: `D${String(i + 1)}`,
    name: documentNameOf(doc.relPath),
    summary: doc.summary,
  }));
  const boundary = chooseBoundary(newId, groupingPromptData(promptDocs));
  const prompt = buildGroupingPrompt(boundary, promptDocs);
  const estimatedTokens = estimateTokens(prompt);
  if (estimatedTokens > budget.available) return { ok: false, reason: 'over_budget' };
  const documents = new Map<string, SuggestedDocumentRef>();
  input.forEach((doc, i) => {
    const promptDoc = promptDocs[i];
    if (promptDoc) {
      documents.set(promptDoc.label, {
        sourceDocumentId: doc.sourceDocumentId,
        name: promptDoc.name,
      });
    }
  });
  return { ok: true, prepared: { prompt, estimatedTokens, documents } };
}

export interface RunGroupingDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly signal: S;
  /** 每次 R6 確認紀錄（S9-2 證據） */
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
}

function failureOf(outcome: Exclude<RunOutcome, { status: 'blocked' }>): GroupingFailure | null {
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

export async function runGrouping<S>(
  prepared: PreparedGrouping,
  deps: RunGroupingDeps<S>,
): Promise<GroupingResult> {
  const outcome = await deps.execute({ prompt: prepared.prompt, signal: deps.signal });
  await deps.recordRunCheck(outcome.record);
  if (outcome.record.provider !== deps.provider || outcome.record.model !== deps.model) {
    throw new Error('執行紀錄的服務或模型與請求不符');
  }
  if (outcome.status === 'blocked') return { ok: false, reason: 'run_check_failed' };
  const failure = failureOf(outcome);
  if (failure !== null || !outcome.result.ok) {
    return { ok: false, reason: failure ?? 'provider_error' };
  }
  const parsed = parseGroupingOutput(outcome.result.text, new Set(prepared.documents.keys()));
  if (!parsed.ok) return { ok: false, reason: 'invalid_output' };
  const used = new Set(parsed.groups.flatMap((g) => g.labels));
  const ref = (label: string): SuggestedDocumentRef => {
    const doc = prepared.documents.get(label);
    if (!doc) throw new Error('驗證過的編號找不到文件');
    return doc;
  };
  return {
    ok: true,
    groups: parsed.groups.map((g) => ({ name: g.name, documents: g.labels.map(ref) })),
    ungrouped: [...prepared.documents].filter(([label]) => !used.has(label)).map(([, doc]) => doc),
  };
}
