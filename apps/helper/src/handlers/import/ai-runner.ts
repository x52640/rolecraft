// 履歷 AI 整理的背景執行（P1-T069；R1、R5、R6、R8、D6）。
// - 只由編輯器要求才開始，在背景送出一次（不自動重試）；狀態只存在 helper 記憶體。
// - 送出前在本機抽出並遮蔽姓名與聯絡資料（pipeline prepareResumeParse），提示裡沒有這些內容。
// - 執行經選定服務的 execute（Claude：ClaudeService.run＋helperClaudeDeps，R5、R6 每次重做），R6 紀錄逐次保存。
// - 模型與服務只來自 helper 自己的選定（engine.select），請求只帶不透明 importId（R7）。
import type { ImportAiParseView, ImportDraftField, RunCheckRecord } from '@rolecraft/contracts';
import {
  prepareResumeParse,
  runResumeParse,
  type PersonalHint,
  type ResumeParsePage,
} from '@rolecraft/pipeline';
import { newId as storageId } from '@rolecraft/storage';

import type { GenerationEngine } from '../resume/generation.ts';
import type { AiParseOutcome } from './service.ts';

export interface ImportAiDeps {
  readonly engine: GenerationEngine;
  readonly recordRunCheck: (record: RunCheckRecord) => void;
  /** 界線標記用 */
  readonly newId?: () => string;
  /** 測試用：背景整理結束時通知 */
  readonly onSettled?: (importId: string) => void;
}

/** 一筆解析成功的匯入：原文行＋本機抽到的姓名與個資提示。 */
export interface AiSource {
  readonly pages: readonly ResumeParsePage[];
  readonly names: readonly ImportDraftField[];
  readonly hints: readonly PersonalHint[];
}

const RUNNING: ImportAiParseView = { state: 'running', failure: null, draft: null };

export interface AiParser {
  start(importId: string, source: AiSource | null): Promise<AiParseOutcome>;
  status(importId: string): ImportAiParseView | null;
  forget(importId: string): void;
}

export function createAiParser(deps: ImportAiDeps): AiParser {
  const makeId = deps.newId ?? storageId;
  const views = new Map<string, ImportAiParseView>();
  const starting = new Map<string, Promise<AiParseOutcome>>();
  /** 每次開始給一個代號；被清掉（forget）或重新開始後，舊的結果不寫回 */
  const runs = new Map<string, number>();
  let counter = 0;

  async function begin(importId: string, source: AiSource | null): Promise<AiParseOutcome> {
    const current = views.get(importId);
    if (current?.state === 'running') return { ok: true, parse: current };
    if (source === null) return { ok: false, reason: 'not_parsed' };
    const selection = await deps.engine.select();
    if (selection === null) return { ok: false, reason: 'no_service' };
    const inputs = { pages: source.pages, names: source.names, personalHints: source.hints };
    const prepared = prepareResumeParse(inputs, selection.budget, makeId);
    if (!prepared.ok) return { ok: false, reason: prepared.reason };

    const run = (counter += 1);
    runs.set(importId, run);
    views.set(importId, RUNNING);
    const settle = (view: ImportAiParseView) => {
      if (runs.get(importId) !== run) return;
      views.set(importId, view);
      deps.onSettled?.(importId);
    };
    void runResumeParse(prepared.prepared, {
      provider: selection.provider,
      model: selection.model,
      execute: (request) => selection.execute(request),
      signal: new AbortController().signal,
      recordRunCheck: (record) => {
        deps.recordRunCheck(record);
        return Promise.resolve();
      },
    }).then(
      (result) =>
        settle(
          result.ok
            ? { state: 'succeeded', failure: null, draft: result.draft }
            : { state: 'failed', failure: result.failure, draft: null },
        ),
      () => settle({ state: 'failed', failure: 'provider_error', draft: null }),
    );
    return { ok: true, parse: RUNNING };
  }

  return {
    start(importId, source) {
      // 同時要求兩次（例如 React StrictMode 的 effect 重跑）：共用同一次啟動，不會送兩次
      let pending = starting.get(importId);
      if (!pending) {
        pending = begin(importId, source).finally(() => starting.delete(importId));
        starting.set(importId, pending);
      }
      return pending;
    },
    status: (importId) => views.get(importId) ?? null,
    forget(importId) {
      views.delete(importId);
      runs.delete(importId);
    },
  };
}
