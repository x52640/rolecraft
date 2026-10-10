/**
 * acceptance.md S9-14：檔案授權測試，每個子句一個測試。
 * 用真實暫存資料夾、symlink 與本機 fs 存取組成端到端流程；
 * spyAccess 記錄所有交給檔案系統的讀取，用來證明「未被讀取」。
 */
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeWorld, spyAccess, type TmpWorld } from './__fixtures__/tmp-folder.ts';
import { createNodeFolderAccess } from './node-folder-access.ts';
import { SourceRegistry } from './registry.ts';

let world: TmpWorld;
beforeEach(async () => {
  world = await makeWorld();
});
afterEach(async () => {
  await world.cleanup();
});

async function openProject() {
  const access = spyAccess(await createNodeFolderAccess(world.project));
  const registry = new SourceRegistry();
  const folder = await registry.addFolder('project', access);
  const idOf = (rel: string) => {
    const item = registry.items().find((i) => i.relPath === rel);
    if (!item) throw new Error(`no item ${rel}`);
    return item.id;
  };
  return { access, registry, folder, idOf };
}

describe('S9-14 檔案授權', () => {
  it('讀檔紀錄只含授權集合', async () => {
    await world.write('README.md', 'r');
    await world.write('plan.md', 'p');
    await world.write('notes.md', 'n');
    const { registry, idOf } = await openProject();
    registry.authorize(idOf('README.md'));
    registry.authorize(idOf('plan.md'));
    for (const item of registry.items()) await registry.read(item.id);
    const authorized = new Set(
      registry
        .items()
        .filter((i) => i.status === 'authorized')
        .map((i) => i.id),
    );
    const log = registry.readLog();
    expect(log.map((e) => e.relPath).sort()).toEqual(['README.md', 'plan.md']);
    expect(log.every((e) => authorized.has(e.itemId))).toBe(true);
    expect(log.every((e) => /^[0-9a-f]{64}$/.test(e.contentHash) && e.readAt.length > 0)).toBe(
      true,
    );
  });

  it('新出現的文件在確認前未被讀取', async () => {
    await world.write('README.md', 'r');
    const { access, registry, folder, idOf } = await openProject();
    registry.authorize(idOf('README.md'));
    await world.write('docs/spec.md', 'new');
    await registry.refreshFolder(folder.id);
    const fresh = registry.items().find((i) => i.relPath === 'docs/spec.md');
    expect(fresh?.status).toBe('pending');
    expect(await registry.read(idOf('docs/spec.md'))).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    expect(access.reads).not.toContain('docs/spec.md');
    registry.authorize(idOf('docs/spec.md'));
    expect(await registry.read(idOf('docs/spec.md'))).toMatchObject({ ok: true, text: 'new' });
  });

  it('取消勾選後不再讀取', async () => {
    await world.write('README.md', 'r');
    const { access, registry, idOf } = await openProject();
    const id = idOf('README.md');
    registry.authorize(id);
    expect((await registry.read(id)).ok).toBe(true);
    registry.revoke(id);
    const readsBefore = access.reads.length;
    expect(await registry.read(id)).toEqual({ ok: false, reason: 'not_authorized' });
    expect(access.reads.length).toBe(readsBefore);
    expect(registry.readLog()).toHaveLength(1);
  });

  it('移除資料夾後不再讀取', async () => {
    await world.write('README.md', 'r');
    const { access, registry, folder, idOf } = await openProject();
    const id = idOf('README.md');
    registry.authorize(id);
    registry.removeFolder(folder.id);
    expect(await registry.read(id)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(access.reads).toEqual([]);
    expect(registry.items()).toEqual([]);
  });

  it('指向資料夾外的符號連結未被跟隨', async () => {
    await world.write('secret.md', 'outside', world.outside);
    await world.write('secret-dir/README.md', 'outside', world.outside);
    await symlink(path.join(world.outside, 'secret.md'), path.join(world.project, 'README.md'));
    await symlink(path.join(world.outside, 'secret-dir'), path.join(world.project, 'docs'));
    const { access, registry, folder } = await openProject();
    expect(registry.items()).toEqual([]);
    expect(folder.excluded.map((e) => [e.relPath, e.reason]).sort()).toEqual([
      ['README.md', 'symlink'],
      ['docs', 'symlink'],
    ]);
    expect(access.reads).toEqual([]);
  });

  describe('預覽後被換成不符類型的檔案未被讀取', () => {
    async function authorizedReadme() {
      await world.write('README.md', 'ok');
      const ctx = await openProject();
      ctx.registry.authorize(ctx.idOf('README.md'));
      await rm(path.join(world.project, 'README.md'));
      return ctx;
    }

    it('換成指向外部的 symlink', async () => {
      await world.write('secret.md', 'outside', world.outside);
      const { registry, idOf } = await authorizedReadme();
      await symlink(path.join(world.outside, 'secret.md'), path.join(world.project, 'README.md'));
      expect(await registry.read(idOf('README.md'))).toEqual({ ok: false, reason: 'symlink' });
      expect(registry.readLog()).toEqual([]);
    });

    it('換成目錄', async () => {
      const { registry, idOf } = await authorizedReadme();
      await mkdir(path.join(world.project, 'README.md'));
      expect(await registry.read(idOf('README.md'))).toEqual({
        ok: false,
        reason: 'not_regular_file',
      });
    });

    it('換成二進位內容（例如被改名的執行檔）', async () => {
      const { registry, idOf } = await authorizedReadme();
      await writeFile(path.join(world.project, 'README.md'), new Uint8Array([0x7f, 0x45, 0, 1]));
      expect(await registry.read(idOf('README.md'))).toEqual({
        ok: false,
        reason: 'binary_content',
      });
      expect(registry.readLog()).toEqual([]);
      expect(registry.rejections().at(-1)).toMatchObject({ reason: 'binary_content' });
    });
  });
});
