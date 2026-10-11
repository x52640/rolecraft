// P1-T058 對抗驗證回歸：資料夾身分、撤銷／移除先落地、同路徑沿用、占用接手接上資料區。
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SourceEntry } from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleSources } from './assemble.ts';
import { createSourcesService, type LocalSources } from './local-sources.ts';
import { createSourcesStore, type SourcesStore } from './persistence.ts';

let base: string;
let file: string;
let project: string;
let secret: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'rolecraft-t058-hardening-'));
  file = path.join(base, 'rolecraft.db');
  project = path.join(base, 'proj');
  secret = path.join(base, 'secret');
  mkdirSync(project);
  mkdirSync(secret);
  writeFileSync(path.join(project, 'README.md'), 'public readme');
  writeFileSync(path.join(secret, 'README.md'), 'SECRET never confirmed');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const picker = () => Promise.resolve([project]);

/** 開一次資料庫（可改寫 store）、組服務、跑 fn、關掉。 */
async function session<T>(
  fn: (sources: LocalSources, store: SourcesStore) => Promise<T>,
  wrap: (store: SourcesStore) => SourcesStore = (s) => s,
): Promise<T> {
  const { db } = openDatabase(file);
  try {
    const store = wrap(createSourcesStore(db));
    return await fn(createSourcesService({ store, picker }), store);
  } finally {
    db.close();
  }
}

async function docsOf(sources: LocalSources, rootId: string): Promise<SourceEntry[]> {
  const result = await sources.preview?.(rootId);
  if (result?.status !== 'ok') throw new Error(`preview: ${JSON.stringify(result)}`);
  return result.entries.filter((e) => e.kind === 'document');
}

async function pickAndAuthorize(sources: LocalSources): Promise<{ rootId: string; id: string }> {
  const picked = await sources.pickFolders?.();
  if (picked?.status !== 'selected') throw new Error('pick');
  const rootId = picked.roots[0]?.rootId ?? '';
  const id = (await docsOf(sources, rootId)).find((e) => e.name === 'README.md')?.entryId ?? '';
  expect(sources.updateAuthorization?.(rootId, [id], [])).toBe('ok');
  return { rootId, id };
}

const storedItems = () => {
  const { db } = openDatabase(file);
  const folders = createRepositories(db).authorizedFolders.list();
  db.close();
  return folders.flatMap((f) => f.items);
};

describe('重啟還原比對資料夾身分', () => {
  it.each([
    ['換成指向別處的符號連結', () => symlinkSync(secret, project)],
    ['換成另一個同名資料夾', () => renameSync(secret, project)],
  ])('%s：不讀到未確認的內容，整個資料夾不可讀、文件降為待確認', async (_name, swap) => {
    const ids = await session(pickAndAuthorize);
    renameSync(project, `${project}-old`);
    swap();
    await session(async (sources) => {
      const read = await sources.registry.read(ids.id);
      expect(read.ok).toBe(false);
      expect(JSON.stringify(read)).not.toContain('SECRET');
      expect(await sources.preview?.(ids.rootId)).toEqual({ status: 'unreadable' });
      expect(sources.listFolders?.()).toEqual([
        { rootId: ids.rootId, name: 'proj', pendingCount: 0, authorizedCount: 0 },
      ]);
      expect(await sources.registry.read(ids.id)).toMatchObject({ ok: false });
    });
    expect(storedItems()).toEqual([]);
    // 換回原本的資料夾也不會自己恢復授權
    rmSync(project, { recursive: true, force: true });
    renameSync(`${project}-old`, project);
    await session(async (sources) => {
      expect(await sources.registry.read(ids.id)).toMatchObject({ ok: false });
    });
  });
});

describe('撤銷／移除先寫資料區才生效', () => {
  const failing =
    (which: 'saveItems' | 'removeFolder', when: () => boolean) =>
    (store: SourcesStore): SourcesStore => {
      const guard = () => {
        if (when()) throw new Error('SQLITE_FULL');
      };
      return which === 'saveItems'
        ? { ...store, saveItems: (id, items) => (guard(), store.saveItems(id, items)) }
        : { ...store, removeFolder: (id) => (guard(), store.removeFolder(id)) };
    };

  it('撤銷寫不進去：丟錯、記憶體不變；重啟後狀態一致（不會一邊撤銷一邊又授權）', async () => {
    let fail = false;
    const ids = await session(
      async (sources) => {
        const ids = await pickAndAuthorize(sources);
        fail = true;
        expect(() => sources.updateAuthorization?.(ids.rootId, [], [ids.id])).toThrow();
        expect(await sources.registry.read(ids.id)).toMatchObject({ ok: true });
        fail = false;
        expect(sources.updateAuthorization?.(ids.rootId, [], [ids.id])).toBe('ok');
        return ids;
      },
      failing('saveItems', () => fail),
    );
    await session(async (sources) => {
      expect(await sources.registry.read(ids.id)).toEqual({ ok: false, reason: 'not_authorized' });
    });
  });

  it('移除寫不進去：丟錯、資料夾仍在且同路徑可再選（沿用同一個 ID）', async () => {
    let fail = false;
    const ids = await session(
      async (sources) => {
        const ids = await pickAndAuthorize(sources);
        fail = true;
        expect(() => sources.removeFolder?.(ids.rootId)).toThrow();
        expect(sources.listFolders?.()).toMatchObject([{ rootId: ids.rootId, authorizedCount: 1 }]);
        fail = false;
        expect(await sources.pickFolders?.()).toEqual({
          status: 'selected',
          roots: [{ rootId: ids.rootId, name: 'proj' }],
        });
        return ids;
      },
      failing('removeFolder', () => fail),
    );
    await session((sources) => {
      expect(sources.listFolders?.()).toMatchObject([{ rootId: ids.rootId, authorizedCount: 1 }]);
      return Promise.resolve();
    });
  });

  it('資料區已有同一路徑（另一個服務實例加的）：選取時沿用，不因唯一鍵失敗', async () => {
    const { db } = openDatabase(file);
    const earlier = createSourcesService({ store: createSourcesStore(db), picker });
    const later = createSourcesService({ store: createSourcesStore(db), picker });
    const ids = await pickAndAuthorize(later);
    expect(await earlier.pickFolders?.()).toEqual({
      status: 'selected',
      roots: [{ rootId: ids.rootId, name: 'proj' }],
    });
    expect(earlier.listFolders?.()).toMatchObject([{ rootId: ids.rootId, authorizedCount: 1 }]);
    db.close();
  });
});

describe('資料區占用接手後接上資料區', () => {
  it('記憶體中的授權與讀檔紀錄寫進資料區；之後撤銷落地、讀檔有紀錄；資料區既有的資料夾一併還原', async () => {
    const other = path.join(base, 'other');
    mkdirSync(other);
    writeFileSync(path.join(other, 'notes.md'), 'n');
    // 另一個 helper 先前存進資料區的資料夾
    const { db: earlierDb } = openDatabase(file);
    const earlier = createSourcesService({
      store: createSourcesStore(earlierDb),
      picker: () => Promise.resolve([other]),
    });
    const picked = await earlier.pickFolders?.();
    const prior = picked?.status === 'selected' ? picked.roots[0]?.rootId : undefined;
    earlierDb.close();

    const memory = assembleSources(undefined, picker, undefined) as LocalSources;
    const ids = await pickAndAuthorize(memory);
    expect(await memory.registry.read(ids.id)).toMatchObject({ ok: true });

    const { db } = openDatabase(file);
    expect(assembleSources(memory, picker, db)).toBe(memory);
    const repos = createRepositories(db);
    expect(repos.sourceReadLog.list().map((e) => e.itemId)).toEqual([ids.id]);
    expect(memory.listFolders?.().map((r) => r.rootId)).toEqual([ids.rootId, prior]);

    expect(memory.updateAuthorization?.(ids.rootId, [], [ids.id])).toBe('ok');
    const items = repos.authorizedFolders.list().flatMap((f) => f.items);
    expect(items).toEqual([expect.objectContaining({ id: ids.id, status: 'revoked' })]);
    db.close();
  });

  it('接手時同一路徑以記憶體為準（資料區舊授權不帶回）', async () => {
    const old = await session(pickAndAuthorize);
    const memory = createSourcesService({ picker });
    const picked = await memory.pickFolders?.();
    const rootId = picked?.status === 'selected' ? picked.roots[0]?.rootId : undefined;
    const { db } = openDatabase(file);
    memory.attachStore(createSourcesStore(db));
    const folders = createRepositories(db).authorizedFolders.list();
    db.close();
    expect(folders.map((f) => [f.id, f.items.length])).toEqual([[rootId, 0]]);
    expect(await memory.registry.read(old.id)).toMatchObject({ ok: false });
  });
});
