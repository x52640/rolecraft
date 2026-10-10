import { execFileSync } from 'node:child_process';
import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isCaseInsensitive, makeWorld, type TmpWorld } from './__fixtures__/tmp-folder.ts';
import { createNodeFolderAccess } from './node-folder-access.ts';
import type { FolderAccess } from './types.ts';

let world: TmpWorld;
beforeEach(async () => {
  world = await makeWorld();
});
afterEach(async () => {
  await world.cleanup();
});

const MAX = 1024;
const text = (r: Awaited<ReturnType<FolderAccess['read']>>) =>
  r.ok ? new TextDecoder().decode(r.bytes) : `rejected:${r.reason}`;

describe('列舉', () => {
  it('只回相對路徑、種類、大小；不進入隱藏與排除資料夾', async () => {
    await world.write('README.md', 'abc');
    await world.write('docs/plan.md', 'p');
    await world.write('node_modules/pkg/README.md', 'x');
    await world.write('.git/HEAD', 'x');
    const access = await createNodeFolderAccess(world.project);
    const entries = await access.list();
    expect(entries.map((e) => [e.relPath, e.kind, e.size]).sort()).toEqual([
      ['README.md', 'file', 3],
      ['docs/plan.md', 'file', 1],
    ]);
  });

  it('指向外部的 symlink（檔案與資料夾）只回報為 symlink，不進入', async () => {
    await world.write('secret.md', 'outside', world.outside);
    await symlink(path.join(world.outside, 'secret.md'), path.join(world.project, 'link.md'));
    await symlink(world.outside, path.join(world.project, 'outdir'));
    const entries = await (await createNodeFolderAccess(world.project)).list();
    expect(entries.map((e) => [e.relPath, e.kind]).sort()).toEqual([
      ['link.md', 'symlink'],
      ['outdir', 'symlink'],
    ]);
  });

  it('資料夾內 symlink 迴圈不會無限列舉', async () => {
    await world.write('a/README.md', 'a');
    await symlink(path.join(world.project, 'a'), path.join(world.project, 'a', 'loop'));
    await symlink('self', path.join(world.project, 'self'));
    const entries = await (await createNodeFolderAccess(world.project)).list();
    expect(entries.map((e) => e.relPath).sort()).toEqual(['a/README.md', 'a/loop', 'self']);
  });

  it('深度與筆數有上限', async () => {
    await world.write('a/b/c/d/README.md', 'x');
    for (let i = 0; i < 5; i += 1) await world.write(`f${i}.md`, 'x');
    const shallow = await createNodeFolderAccess(world.project, { maxDepth: 2 });
    expect((await shallow.list()).some((e) => e.relPath.includes('d/README'))).toBe(false);
    const few = await createNodeFolderAccess(world.project, { maxEntries: 3 });
    expect(await few.list()).toHaveLength(3);
  });
});

describe('安全讀檔', () => {
  it('一般檔可讀', async () => {
    await world.write('docs/README.md', '內容');
    const access = await createNodeFolderAccess(world.project);
    expect(text(await access.read('docs/README.md', MAX))).toBe('內容');
  });

  it.each(['../outside/secret.md', 'docs/../../outside/secret.md', '/etc/hosts', 'docs/./a.md'])(
    '路徑 %s 被拒（含 .. 或非乾淨相對路徑）',
    async (rel) => {
      await world.write('secret.md', 's', world.outside);
      const access = await createNodeFolderAccess(world.project);
      expect(text(await access.read(rel, MAX))).toBe('rejected:invalid_path');
    },
  );

  it('檔案本身是指向外部的 symlink：拒絕', async () => {
    await world.write('secret.md', 'outside', world.outside);
    await symlink(path.join(world.outside, 'secret.md'), path.join(world.project, 'README.md'));
    const access = await createNodeFolderAccess(world.project);
    expect(text(await access.read('README.md', MAX))).toBe('rejected:symlink');
  });

  it('TOCTOU：預覽後檔案被換成指向外部的 symlink', async () => {
    await world.write('README.md', 'ok');
    await world.write('secret.md', 'outside', world.outside);
    const access = await createNodeFolderAccess(world.project);
    await rm(path.join(world.project, 'README.md'));
    await symlink(path.join(world.outside, 'secret.md'), path.join(world.project, 'README.md'));
    expect(text(await access.read('README.md', MAX))).toBe('rejected:symlink');
  });

  it('TOCTOU：預覽後檔案被換成目錄', async () => {
    await world.write('README.md', 'ok');
    const access = await createNodeFolderAccess(world.project);
    await rm(path.join(world.project, 'README.md'));
    await mkdir(path.join(world.project, 'README.md'));
    expect(text(await access.read('README.md', MAX))).toBe('rejected:not_regular_file');
  });

  it('TOCTOU：預覽後檔案被換成 FIFO（不會卡住）', async () => {
    await world.write('README.md', 'ok');
    const access = await createNodeFolderAccess(world.project);
    await rm(path.join(world.project, 'README.md'));
    execFileSync('mkfifo', [path.join(world.project, 'README.md')]);
    expect(text(await access.read('README.md', MAX))).toBe('rejected:not_regular_file');
  });

  it('TOCTOU：中間資料夾被換成指向外部的 symlink', async () => {
    await world.write('docs/README.md', 'ok');
    await world.write('docs/README.md', 'outside', world.outside);
    const access = await createNodeFolderAccess(world.project);
    await rm(path.join(world.project, 'docs'), { recursive: true });
    await symlink(path.join(world.outside, 'docs'), path.join(world.project, 'docs'));
    expect(text(await access.read('docs/README.md', MAX))).toBe('rejected:outside_folder');
  });

  it('TOCTOU：中間資料夾被換成指向資料夾內另一處的 symlink（避免讀到未授權檔）', async () => {
    await world.write('docs/README.md', 'ok');
    await world.write('private/README.md', '未授權');
    const access = await createNodeFolderAccess(world.project);
    await rm(path.join(world.project, 'docs'), { recursive: true });
    await symlink(path.join(world.project, 'private'), path.join(world.project, 'docs'));
    expect(text(await access.read('docs/README.md', MAX))).toBe('rejected:path_changed');
  });

  it('選取的資料夾本身事後被換成 symlink：拒絕', async () => {
    await world.write('README.md', 'ok');
    await world.write('README.md', 'outside', world.outside);
    const access = await createNodeFolderAccess(world.project);
    await rename(world.project, `${world.project}-moved`);
    await symlink(world.outside, world.project);
    expect(text(await access.read('README.md', MAX))).toBe('rejected:outside_folder');
  });

  it('超過大小上限：拒絕', async () => {
    await world.write('README.md', 'x'.repeat(MAX + 1));
    const access = await createNodeFolderAccess(world.project);
    expect(text(await access.read('README.md', MAX))).toBe('rejected:too_large');
  });

  it('檔案不存在：not_found', async () => {
    const access = await createNodeFolderAccess(world.project);
    expect(text(await access.read('README.md', MAX))).toBe('rejected:not_found');
  });

  it('大小寫不同的同名檔：只讀到列舉時的那一個，不會用別的大小寫讀到檔案', async () => {
    await world.write('README.md', 'upper');
    const access = await createNodeFolderAccess(world.project);
    if (await isCaseInsensitive(world.project)) {
      // 大小寫不敏感 FS：readme.md 會開到 README.md，但實際路徑不等於要求的路徑 → 拒絕
      expect(text(await access.read('readme.md', MAX))).toBe('rejected:path_changed');
    } else {
      await writeFile(path.join(world.project, 'readme.md'), 'lower');
      expect(text(await access.read('readme.md', MAX))).toBe('lower');
    }
    expect(text(await access.read('README.md', MAX))).toBe('upper');
  });

  it('選取的不是資料夾：建立失敗', async () => {
    const file = await world.write('README.md', 'x');
    await expect(createNodeFolderAccess(file)).rejects.toThrow();
  });
});
