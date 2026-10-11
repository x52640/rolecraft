// P1-T058：sources 服務的資料區保存。真實暫存資料夾＋真實 SQLite 檔，同一資料庫開兩次模擬重啟。
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SourceEntry } from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSourcesService, type LocalSources } from './local-sources.ts';
import { createSourcesStore, type SourcesStore } from './persistence.ts';

let base: string;
let file: string;
let project: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'rolecraft-t058-sources-'));
  file = path.join(base, 'rolecraft.db');
  project = path.join(base, '專案甲');
  mkdirSync(path.join(project, 'docs'), { recursive: true });
  writeFileSync(path.join(project, 'README.md'), '# 專案甲');
  writeFileSync(path.join(project, 'docs', 'spec.md'), 'spec');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

/** 開一次資料庫、組一個 sources 服務、跑 fn、關掉（模擬一次 helper 程序）。 */
async function session<T>(fn: (sources: LocalSources) => Promise<T>): Promise<T> {
  const { db } = openDatabase(file);
  try {
    const store = createSourcesStore(db);
    return await fn(createSourcesService({ store, picker: () => Promise.resolve([project]) }));
  } finally {
    db.close();
  }
}

async function docsOf(sources: LocalSources, rootId: string): Promise<SourceEntry[]> {
  const result = await sources.preview?.(rootId);
  if (result?.status !== 'ok') throw new Error(`preview: ${JSON.stringify(result)}`);
  return result.entries.filter((e) => e.kind === 'document');
}

const idOf = (entries: SourceEntry[], name: string): string => {
  const found = entries.find((e) => e.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found.entryId;
};

/** 第一次程序：選資料夾、授權 README、撤銷 spec、讀一次 README。 */
async function firstRun(): Promise<{ rootId: string; readme: string; spec: string }> {
  return session(async (sources) => {
    const picked = await sources.pickFolders?.();
    if (picked?.status !== 'selected') throw new Error('pick');
    const rootId = picked.roots[0]?.rootId ?? '';
    const docs = await docsOf(sources, rootId);
    const readme = idOf(docs, 'README.md');
    const spec = idOf(docs, 'spec.md');
    expect(sources.updateAuthorization?.(rootId, [readme], [spec])).toBe('ok');
    expect(await sources.registry.read(readme)).toMatchObject({ ok: true });
    return { rootId, readme, spec };
  });
}

describe('sources 持久化（P1-T058）', () => {
  it('重啟後資料夾 ID、文件 ID、授權狀態都還在；已授權文件不必重新預覽就能讀', async () => {
    const { rootId, readme, spec } = await firstRun();
    await session(async (sources) => {
      expect(sources.listFolders?.()).toEqual([
        { rootId, name: '專案甲', pendingCount: 0, authorizedCount: 1 },
      ]);
      expect(await sources.registry.read(readme)).toMatchObject({ ok: true, text: '# 專案甲' });
      expect(await sources.registry.read(spec)).toEqual({ ok: false, reason: 'not_authorized' });
      const docs = await docsOf(sources, rootId);
      expect(idOf(docs, 'README.md')).toBe(readme);
      expect(docs.find((d) => d.entryId === readme)?.authorization).toBe('authorized');
      expect(docs.find((d) => d.entryId === spec)?.authorization).toBe('revoked');
      // 同一路徑再選一次：沿用原本的資料夾，不新增
      const again = await sources.pickFolders?.();
      expect(again).toEqual({ status: 'selected', roots: [{ rootId, name: '專案甲' }] });
    });
    const { db } = openDatabase(file);
    const log = createRepositories(db).sourceReadLog.list();
    db.close();
    expect(log.map((e) => [e.itemId, e.folderId, e.relPath])).toEqual([
      [readme, rootId, 'README.md'],
      [readme, rootId, 'README.md'],
    ]);
    expect(log[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('還原後的撤銷與移除照常寫入；移除後重啟不再出現，讀檔紀錄保留', async () => {
    const { rootId, readme } = await firstRun();
    await session(async (sources) => {
      await docsOf(sources, rootId);
      expect(sources.updateAuthorization?.(rootId, [], [readme])).toBe('ok');
    });
    await session(async (sources) => {
      expect(await sources.registry.read(readme)).toEqual({ ok: false, reason: 'not_authorized' });
      expect(sources.removeFolder?.(rootId)).toBe(true);
    });
    await session((sources) => {
      expect(sources.listFolders?.()).toEqual([]);
      return Promise.resolve();
    });
    const { db } = openDatabase(file);
    expect(createRepositories(db).sourceReadLog.list()).toHaveLength(1);
    db.close();
  });

  it('資料夾已不存在或已不是資料夾：照常列出、預覽回無法讀取、讀取被拒，不自動刪', async () => {
    const { rootId, readme } = await firstRun();
    rmSync(project, { recursive: true, force: true });
    await session(async (sources) => {
      expect(sources.listFolders?.()).toMatchObject([{ rootId, authorizedCount: 1 }]);
      expect(await sources.preview?.(rootId)).toEqual({ status: 'unreadable' });
      expect(await sources.registry.read(readme)).toMatchObject({ ok: false });
    });
    writeFileSync(project, 'now a file');
    await session(async (sources) => {
      expect(sources.listFolders?.()).toMatchObject([{ rootId }]);
      expect(await sources.preview?.(rootId)).toEqual({ status: 'unreadable' });
    });
    const { db } = openDatabase(file);
    expect(
      createRepositories(db)
        .authorizedFolders.list()
        .map((f) => f.id),
    ).toEqual([rootId]);
    db.close();
  });

  it('資料夾恢復後下次預覽即可讀（不會永遠記住失敗）', async () => {
    const { rootId, readme } = await firstRun();
    const moved = `${project}-moved`;
    await session(async (sources) => {
      renameSync(project, moved);
      expect(await sources.preview?.(rootId)).toEqual({ status: 'unreadable' });
      renameSync(moved, project);
      expect(await sources.preview?.(rootId)).toMatchObject({ status: 'ok' });
      expect(await sources.registry.read(readme)).toMatchObject({ ok: true });
    });
  });

  it('寫入失敗：新增資料夾失敗不留半套；授權寫不進去就不授權；讀檔紀錄寫不進去就不交出內容', async () => {
    const failing = (overrides: Partial<SourcesStore>): SourcesStore => ({
      load: () => [],
      addFolder: () => {},
      removeFolder: () => {},
      saveItems: () => {},
      clearItems: () => {},
      appendRead: () => {},
      transaction: (fn) => fn(),
      ...overrides,
    });
    const boom = () => {
      throw new Error('disk');
    };
    const picker = () => Promise.resolve([project]);

    const addFails = createSourcesService({ store: failing({ addFolder: boom }), picker });
    await expect(addFails.pickFolders?.()).rejects.toThrow();
    expect(addFails.listFolders?.()).toEqual([]);
    expect(addFails.registry.folders()).toEqual([]);

    const saveFails = createSourcesService({ store: failing({ saveItems: boom }), picker });
    const picked = await saveFails.pickFolders?.();
    const rootId = picked?.status === 'selected' ? (picked.roots[0]?.rootId ?? '') : '';
    const readme = idOf(await docsOf(saveFails, rootId), 'README.md');
    expect(() => saveFails.updateAuthorization?.(rootId, [readme], [])).toThrow();
    expect(await saveFails.registry.read(readme)).toEqual({ ok: false, reason: 'not_authorized' });

    const logFails = createSourcesService({ store: failing({ appendRead: boom }), picker });
    const picked2 = await logFails.pickFolders?.();
    const root2 = picked2?.status === 'selected' ? (picked2.roots[0]?.rootId ?? '') : '';
    const readme2 = idOf(await docsOf(logFails, root2), 'README.md');
    expect(logFails.updateAuthorization?.(root2, [readme2], [])).toBe('ok');
    await expect(logFails.registry.read(readme2)).rejects.toThrow();
  });
});
