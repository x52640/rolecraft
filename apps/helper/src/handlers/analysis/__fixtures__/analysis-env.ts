// analysis 測試共用：暫存資料區（真實 SQLite 檔）、假資料夾（記憶體內的檔案，不碰真實專案）、
// 假 provider（createFakeAdapter＋runWithSubscriptionCheck，不呼叫任何真實 CLI）。
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { BridgeOperation } from '@rolecraft/contracts';
import {
  createFakeAdapter,
  runWithSubscriptionCheck,
  type FakeAdapterOptions,
  type FakeStep,
} from '@rolecraft/providers';
import type { FolderAccess, RawEntry } from '@rolecraft/sources';
import {
  createLocalFileStore,
  createRepositories,
  openDatabase,
  type Repositories,
} from '@rolecraft/storage';

import { recordingLogger } from '../../../__fixtures__/requests.ts';
import { dispatch } from '../../../bridge/dispatch.ts';
import { createClaimsService } from '../../claims/storage-service.ts';
import { pauseInterruptedJobs } from '../../resume/assemble.ts';
import { createSourcesService, type LocalSources } from '../../sources/local-sources.ts';
import { createSourcesStore } from '../../sources/persistence.ts';
import type { AnalysisEngine } from '../engine.ts';
import { createAnalysis } from '../flow.ts';

export const PROJECT = '/fake/專案甲';

/** 假資料夾：檔名 → 內容；可在測試中途改內容或刪檔。 */
export type FakeFiles = Map<string, string>;

function fakeAccess(files: FakeFiles): FolderAccess {
  return {
    list: () =>
      Promise.resolve(
        [...files].map(([relPath, text]): RawEntry => ({
          relPath,
          kind: 'file',
          size: new TextEncoder().encode(text).byteLength,
        })),
      ),
    read: (relPath) => {
      const text = files.get(relPath);
      if (text === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      return Promise.resolve({ ok: true, bytes: new TextEncoder().encode(text) });
    },
  };
}

/** 依提示內容決定這次回應（不同文件給不同輸出）；null 表示一直等到取消。 */
export type Responder = (prompt: string) => FakeStep;

export interface FakeEngine {
  readonly engine: AnalysisEngine;
  readonly prompts: string[];
  rechecks: number;
  recheckPasses: boolean;
  selectable: boolean;
}

export function fakeEngine(respond: Responder, fake: FakeAdapterOptions = {}): FakeEngine {
  const state: FakeEngine = {
    prompts: [],
    rechecks: 0,
    recheckPasses: true,
    selectable: true,
    engine: {
      select: () =>
        Promise.resolve(
          state.selectable
            ? {
                provider: 'claude',
                model: 'fake-model',
                budget: {
                  contextLimit: 200_000,
                  outputReserve: 0,
                  toolOverheadReserve: 0,
                  available: 200_000,
                },
                execute: ({ prompt, signal }) => {
                  state.prompts.push(prompt);
                  const adapter = createFakeAdapter({ ...fake, script: [respond(prompt)] });
                  return runWithSubscriptionCheck(
                    adapter,
                    { model: 'fake-model', prompt, trigger: 'run_start', signal },
                    { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: randomUUID },
                  );
                },
              }
            : null,
        ),
      recheck: () => {
        state.rechecks += 1;
        return Promise.resolve(state.recheckPasses);
      },
      sleep: () => Promise.resolve(),
    },
  };
  return state;
}

/** 一次「helper 程序」：資料庫連線、sources 服務（接資料區保存）、分析服務。 */
export interface HelperRun {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly sources: LocalSources;
  readonly fake: FakeEngine;
  /** 等目前的背景分析結束 */
  settled(): Promise<string>;
  /** 等目前的背景分組建議結束（P1-T063） */
  suggestionSettled(): Promise<string>;
  call(op: BridgeOperation, payload?: unknown): Promise<Record<string, unknown>>;
}

export interface TestDataDir {
  readonly files: FakeFiles;
  /** 開一個 helper（重開時先把執行中的工作改為已暫停，同 main.ts） */
  open(fake: FakeEngine, override?: (repos: Repositories) => Repositories): HelperRun;
  cleanup(): void;
}

/** 背景工作結束通知的佇列：先結束、後等待也拿得到。 */
function settledQueue() {
  const done: string[] = [];
  const waiters: ((id: string) => void)[] = [];
  return {
    notify: (id: string) => {
      const waiter = waiters.shift();
      if (waiter) waiter(id);
      else done.push(id);
    },
    wait: () =>
      new Promise<string>((resolve) => {
        const id = done.shift();
        if (id === undefined) waiters.push(resolve);
        else resolve(id);
      }),
  };
}

export function testDataDir(files: Record<string, string>): TestDataDir {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-analysis-'));
  const file = path.join(dir, 'rolecraft.db');
  const folder: FakeFiles = new Map(Object.entries(files));
  const opened: DatabaseSync[] = [];
  return {
    files: folder,
    open(fake, override) {
      for (const db of opened.splice(0)) if (db.isOpen) db.close();
      const { db } = openDatabase(file);
      opened.push(db);
      pauseInterruptedJobs(db);
      const repos = createRepositories(db);
      const sources = createSourcesService({
        picker: () => Promise.resolve([PROJECT]),
        openFolder: () => Promise.resolve(fakeAccess(folder)),
        identify: (absolutePath) => Promise.resolve({ realPath: absolutePath, dev: '1', ino: '1' }),
        store: createSourcesStore(db),
      });
      // 背景工作結束的通知排隊：先結束、後等待也拿得到
      const jobs = settledQueue();
      const suggestions = settledQueue();
      const analysis = createAnalysis({
        db,
        repos: override ? override(repos) : repos,
        registry: sources.registry,
        engine: fake.engine,
        onSettled: jobs.notify,
        onSuggestionSettled: suggestions.notify,
      });
      const claims = createClaimsService({
        db,
        fileStore: createLocalFileStore(path.join(dir, 'files')),
      });
      return {
        db,
        repos,
        sources,
        fake,
        settled: jobs.wait,
        suggestionSettled: suggestions.wait,
        call: async (op, payload = {}) => {
          const services = { sources, analysis, claims };
          const result = await dispatch({ op, payload }, services, recordingLogger());
          return result.response as Record<string, unknown>;
        },
      };
    },
    cleanup() {
      for (const db of opened) if (db.isOpen) db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 加入假資料夾（第一次）並授權或撤銷指定文件。 */
export async function authorize(
  run: HelperRun,
  names: { authorize?: readonly string[]; revoke?: readonly string[] },
): Promise<void> {
  const service = run.sources;
  const list = () => service.listFolders?.() ?? [];
  if (list().length === 0) await service.pickFolders?.();
  const rootId = list()[0]?.rootId ?? '';
  const preview = await service.preview?.(rootId);
  if (preview?.status !== 'ok') throw new Error('預覽失敗');
  const idOf = (name: string) => {
    const entry = preview.entries.find((e) => e.name === name && e.kind === 'document');
    if (!entry) throw new Error(`找不到 ${name}`);
    return entry.entryId;
  };
  const result = service.updateAuthorization?.(
    rootId,
    (names.authorize ?? []).map(idOf),
    (names.revoke ?? []).map(idOf),
  );
  if (result !== 'ok') throw new Error(result);
}

/** 模型輸出（事實項草稿）。 */
export function output(claims: readonly object[], summary = '摘要'): FakeStep {
  return { text: JSON.stringify({ claims, conflicts: [], summary }) };
}

export function feature(text: string, excerpt: string, completionStatus = 'documented_done') {
  return { segment: 'S1', type: 'feature', text, completionStatus, excerpt };
}
