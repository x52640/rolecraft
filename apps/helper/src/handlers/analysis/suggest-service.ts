// 專案分組建議（P1-T063，D23）：只由使用者按下觸發，在背景執行，結果只留在記憶體。
// - 輸入只有「目前已授權（授權集合與資料區都是已授權）、尚未屬於任何專案、有摘要」的文件：
//   該文件的摘要段落與在授權資料夾內的相對路徑（R4：不送絕對路徑、不送原文、不讀檔）。
// - 沒有選定且可用的模型、沒有可分組的文件、超過輸入預算：不呼叫模型，直接回失敗。
// - 執行經選定服務的 execute（訂閱檢查包裝，R5、R6 每次重做），R6 紀錄逐次保存。
// - 建議不建立任何專案；建立由使用者確認後的 claims.create_projects 負責。
import type { ProjectSuggestionView, SuggestedDocument } from '@rolecraft/contracts';
import { prepareGrouping, runGrouping, type GroupingDocument } from '@rolecraft/pipeline';
import type { SourceRegistry } from '@rolecraft/sources';
import { newId as storageId, type Repositories } from '@rolecraft/storage';

import type { AnalysisEngine } from './engine.ts';
import type { SuggestResult } from './service.ts';

export interface SuggesterDeps {
  readonly repos: Repositories;
  readonly registry: SourceRegistry;
  readonly engine: AnalysisEngine;
  readonly newId?: () => string;
  /** 測試用：背景建議結束時通知 */
  readonly onSuggestionSettled?: (suggestionId: string) => void;
}

/** 建議的輸入：授權集合與資料區都標已授權、尚未屬於任何專案、摘要非空白的文件。 */
export function groupingInput(repos: Repositories, registry: SourceRegistry): GroupingDocument[] {
  const authorized = new Set(
    registry
      .items()
      .filter((item) => item.status === 'authorized')
      .map((item) => item.id),
  );
  const assigned = repos.projectDocuments.all();
  const input: GroupingDocument[] = [];
  for (const summary of repos.analysisState.listSummaries()) {
    const id = summary.sourceDocumentId;
    if (!/\S/u.test(summary.text) || assigned.has(id) || !authorized.has(id)) continue;
    const document = repos.sourceDocuments.get(id);
    if (document?.authorizationStatus !== 'authorized') continue;
    input.push({ sourceDocumentId: id, relPath: document.documentPath, summary: summary.text });
  }
  return input;
}

const view = (
  suggestionId: string,
  rest: Omit<ProjectSuggestionView, 'suggestionId'>,
): ProjectSuggestionView => ({ suggestionId, ...rest });

export function createProjectSuggester(deps: SuggesterDeps) {
  const { repos, registry, engine } = deps;
  const newId = deps.newId ?? storageId;
  let latest: ProjectSuggestionView | null = null;
  let starting: Promise<SuggestResult> | null = null;

  async function begin(): Promise<SuggestResult> {
    if (latest?.state === 'running') return { ok: true, suggestion: latest };
    const selection = await engine.select();
    if (selection === null) return { ok: false, reason: 'no_model' };
    const prepared = prepareGrouping(groupingInput(repos, registry), selection.budget, newId);
    if (!prepared.ok) return { ok: false, reason: prepared.reason };

    const suggestionId = newId();
    const documents: SuggestedDocument[] = [...prepared.prepared.documents.values()];
    const running = view(suggestionId, {
      state: 'running',
      failure: null,
      groups: [],
      ungrouped: documents,
    });
    latest = running;
    const settle = (next: ProjectSuggestionView) => {
      if (latest?.suggestionId === suggestionId) latest = next;
      deps.onSuggestionSettled?.(suggestionId);
    };
    void runGrouping(prepared.prepared, {
      provider: selection.provider,
      model: selection.model,
      execute: (request) => selection.execute(request),
      signal: new AbortController().signal,
      recordRunCheck: (record) => {
        repos.runCheckRecords.append(record);
        return Promise.resolve();
      },
    }).then(
      (result) =>
        settle(
          result.ok
            ? view(suggestionId, {
                state: 'ready',
                failure: null,
                groups: result.groups.map((g) => ({ name: g.name, documents: [...g.documents] })),
                ungrouped: [...result.ungrouped],
              })
            : view(suggestionId, {
                state: 'failed',
                failure: result.reason,
                groups: [],
                ungrouped: documents,
              }),
        ),
      () =>
        settle(
          view(suggestionId, {
            state: 'failed',
            failure: 'provider_error',
            groups: [],
            ungrouped: documents,
          }),
        ),
    );
    return { ok: true, suggestion: running };
  }

  return {
    suggestProjects(): Promise<SuggestResult> {
      // 同時按兩次：共用同一次啟動，不會送兩次
      starting ??= begin().finally(() => {
        starting = null;
      });
      return starting;
    },
    projectSuggestion: () => Promise.resolve(latest),
  };
}
