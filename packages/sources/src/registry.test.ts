import { describe, expect, it } from 'vitest';

import { SourceRegistry } from './registry.ts';
import type { AccessReadResult, FolderAccess, RawEntry } from './types.ts';

/** 記憶體中的假資料夾：模擬「瀏覽器讀內容送給 helper」這類非 fs 機制。 */
class FakeFolder implements FolderAccess {
  readonly files = new Map<string, Uint8Array>();
  readonly extra: RawEntry[] = [];
  readonly reads: string[] = [];
  gate: Promise<void> | null = null;

  put(rel: string, text: string): void {
    this.files.set(rel, new TextEncoder().encode(text));
  }
  list(): Promise<RawEntry[]> {
    const files = [...this.files].map(([relPath, b]) => ({
      relPath,
      kind: 'file' as const,
      size: b.byteLength,
    }));
    return Promise.resolve([...files, ...this.extra]);
  }
  async read(relPath: string): Promise<AccessReadResult> {
    this.reads.push(relPath);
    if (this.gate) await this.gate;
    const bytes = this.files.get(relPath);
    return bytes ? { ok: true, bytes } : { ok: false, reason: 'not_found' };
  }
}

const fixedClock = () => new Date('2026-10-10T00:00:00.000Z');

async function setup(files: Record<string, string>) {
  const folder = new FakeFolder();
  for (const [rel, text] of Object.entries(files)) folder.put(rel, text);
  let n = 0;
  const registry = new SourceRegistry({ clock: fixedClock, newId: () => `id-${++n}` });
  const summary = await registry.addFolder('專案A', folder);
  const idOf = (rel: string) => {
    const item = registry.items().find((i) => i.relPath === rel);
    if (!item) throw new Error(`no item ${rel}`);
    return item.id;
  };
  return { folder, registry, summary, idOf };
}

describe('SourceRegistry 授權集合', () => {
  it('列舉後候選一律待確認，排除項目附原因', async () => {
    const { registry, summary } = await setup({
      'README.md': '# a',
      'src/a.ts': 'x',
      '.env': 'K=1',
    });
    expect(registry.items().map((i) => [i.relPath, i.status])).toEqual([['README.md', 'pending']]);
    expect(summary.excluded).toEqual([
      { relPath: 'src/a.ts', reason: 'source_code' },
      { relPath: '.env', reason: 'hidden' },
    ]);
  });

  it('列舉來源回報含 .. 或絕對路徑的項目一律排除，不會成為可讀項目', async () => {
    const folder = new FakeFolder();
    folder.extra.push({ relPath: '../outside/README.md', kind: 'file', size: 3 });
    folder.extra.push({ relPath: '/etc/README.md', kind: 'file', size: 3 });
    const registry = new SourceRegistry();
    const summary = await registry.addFolder('x', folder);
    expect(registry.items()).toEqual([]);
    expect(summary.excluded.map((e) => e.reason)).toEqual(['invalid_path', 'invalid_path']);
  });

  it('讀檔介面只接受項目 ID：路徑字串不是有效 ID', async () => {
    const { registry, folder } = await setup({ 'README.md': '# a' });
    expect(await registry.read('README.md')).toEqual({ ok: false, reason: 'unknown_item' });
    expect(folder.reads).toEqual([]);
  });

  it('授權後可讀，紀錄路徑、時間、sha256', async () => {
    const { registry, idOf } = await setup({ 'README.md': 'hello' });
    registry.authorize(idOf('README.md'));
    const result = await registry.read(idOf('README.md'));
    const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    expect(result).toEqual({ ok: true, text: 'hello', contentHash: hash });
    expect(registry.readLog()).toEqual([
      {
        itemId: 'id-2',
        folderId: 'id-1',
        relPath: 'README.md',
        readAt: '2026-10-10T00:00:00.000Z',
        contentHash: hash,
      },
    ]);
  });

  it('二進位內容不交出', async () => {
    const { registry, folder, idOf } = await setup({ 'README.md': 'a' });
    folder.files.set('README.md', new Uint8Array([0x61, 0x00]));
    registry.authorize(idOf('README.md'));
    expect(await registry.read(idOf('README.md'))).toEqual({ ok: false, reason: 'binary_content' });
    expect(registry.readLog()).toEqual([]);
  });

  it('存取端丟例外時回 io_error、不記讀檔', async () => {
    const { registry, folder, idOf } = await setup({ 'README.md': 'a' });
    folder.read = () => Promise.reject(new Error('boom'));
    registry.authorize(idOf('README.md'));
    expect(await registry.read(idOf('README.md'))).toEqual({ ok: false, reason: 'io_error' });
  });

  it('讀取進行中被取消勾選：不交出內容、不記錄', async () => {
    const { registry, folder, idOf } = await setup({ 'README.md': 'a' });
    const id = idOf('README.md');
    registry.authorize(id);
    let release!: () => void;
    folder.gate = new Promise((r) => (release = r));
    const pending = registry.read(id);
    registry.revoke(id);
    release();
    expect(await pending).toEqual({ ok: false, reason: 'not_authorized' });
    expect(registry.readLog()).toEqual([]);
  });

  it('讀取進行中資料夾被移除：不交出內容', async () => {
    const { registry, folder, summary, idOf } = await setup({ 'README.md': 'a' });
    const id = idOf('README.md');
    registry.authorize(id);
    let release!: () => void;
    folder.gate = new Promise((r) => (release = r));
    const pending = registry.read(id);
    registry.removeFolder(summary.id);
    release();
    expect((await pending).ok).toBe(false);
    expect(registry.readLog()).toEqual([]);
  });

  it('移除子資料夾（revokeUnder）只撤銷底下的項目', async () => {
    const { registry, summary, idOf } = await setup({ 'docs/a.md': 'a', 'docs2/b.md': 'b' });
    registry.authorize(idOf('docs/a.md'));
    registry.authorize(idOf('docs2/b.md'));
    expect(registry.revokeUnder(summary.id, 'docs')).toBe(1);
    expect(registry.items().map((i) => [i.relPath, i.status])).toEqual([
      ['docs/a.md', 'revoked'],
      ['docs2/b.md', 'authorized'],
    ]);
  });

  it('revokeUnder：可帶結尾斜線；不合法、空字串、未列舉或大小寫不同的路徑丟錯，不默默回 0', async () => {
    const { registry, summary, idOf } = await setup({ 'docs/a.md': 'a', 'docs/sub/b.md': 'b' });
    registry.authorize(idOf('docs/a.md'));
    registry.authorize(idOf('docs/sub/b.md'));
    for (const bad of ['', '/', './docs', 'docs//', '../docs', 'Docs', 'nope', 'docs/a.md']) {
      expect(() => registry.revokeUnder(summary.id, bad), bad).toThrow();
    }
    expect(registry.items().every((i) => i.status === 'authorized')).toBe(true);
    expect(registry.revokeUnder(summary.id, 'docs/sub/')).toBe(1);
    expect(registry.revokeUnder(summary.id, 'docs/')).toBe(2);
  });

  it('增量列舉保留授權狀態；撤銷的不會被重新列舉打回待確認；消失的不可讀', async () => {
    const { registry, folder, summary, idOf } = await setup({ 'a.md': 'a', 'b.md': 'b' });
    registry.authorize(idOf('a.md'));
    registry.revoke(idOf('b.md'));
    folder.files.delete('a.md');
    folder.put('c.md', 'c');
    await registry.refreshFolder(summary.id);
    const state = registry.items().map((i) => [i.relPath, i.status, i.present]);
    expect(state).toEqual([
      ['a.md', 'authorized', false],
      ['b.md', 'revoked', true],
      ['c.md', 'pending', true],
    ]);
    expect(await registry.read(idOf('a.md'))).toEqual({ ok: false, reason: 'not_found' });
    expect(() => registry.authorize(idOf('a.md'))).toThrow();
  });

  it('大小寫不同的同名檔是不同項目，授權一個不等於授權另一個', async () => {
    const { registry, idOf } = await setup({ 'README.md': 'upper', 'readme.md': 'lower' });
    registry.authorize(idOf('README.md'));
    expect(await registry.read(idOf('readme.md'))).toEqual({ ok: false, reason: 'not_authorized' });
    expect(await registry.read(idOf('README.md'))).toMatchObject({ ok: true, text: 'upper' });
  });

  it('被拒的嘗試另列提示，不進讀檔紀錄', async () => {
    const { registry, idOf } = await setup({ 'README.md': 'a' });
    await registry.read(idOf('README.md'));
    expect(registry.readLog()).toEqual([]);
    expect(registry.rejections()).toMatchObject([
      { itemId: idOf('README.md'), reason: 'not_authorized' },
    ]);
  });
});
