/**
 * 對抗驗證回歸：讀檔與列舉期間把中間資料夾／根資料夾換掉。
 * 確定性測試用 testHooks 在檢查之間換檔；真正的並行競態測試只在 RUN_RACE=1 時跑。
 */
import { spawn } from 'node:child_process';
import { mkdir, rename, symlink } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeWorld, type TmpWorld } from './__fixtures__/tmp-folder.ts';
import { createNodeFolderAccess, type ReadStage } from './node-folder-access.ts';
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

/** 把 project/docs 換成指向 outside/docs 的 symlink；回傳換回來的函式。 */
async function swapDocsToOutside(): Promise<() => Promise<void>> {
  const docs = path.join(world.project, 'docs');
  const stash = path.join(world.project, '..', 'docs-stash');
  await rename(docs, stash);
  await symlink(path.join(world.outside, 'docs'), docs);
  return async () => {
    await rename(docs, path.join(world.project, '..', 'link-stash'));
    await rename(stash, docs);
  };
}

describe('讀檔競態（確定性）', () => {
  it.each<ReadStage>(['checked', 'opened', 'read'])(
    '在 %s 之後把中間資料夾換成指向外部的 symlink：拒絕，不交出外部內容',
    async (stage) => {
      await world.write('docs/notes.md', 'inside');
      await world.write('docs/notes.md', 'SECRET-OUTSIDE', world.outside);
      const access = await createNodeFolderAccess(world.project, {
        testHooks: {
          onReadStage: async (s) => {
            if (s === stage) await swapDocsToOutside();
          },
        },
      });
      const result = text(await access.read('docs/notes.md', MAX));
      expect(result.startsWith('rejected:')).toBe(true);
    },
  );

  it('檢查後換成外部、開檔後又換回（原 PoC 的模式）：fd 不是檢查過的檔 → path_changed', async () => {
    await world.write('docs/notes.md', 'inside');
    await world.write('docs/notes.md', 'SECRET-OUTSIDE', world.outside);
    let restore: (() => Promise<void>) | undefined;
    const access = await createNodeFolderAccess(world.project, {
      testHooks: {
        onReadStage: async (s) => {
          if (s === 'checked') restore = await swapDocsToOutside();
          if (s === 'opened') await restore?.();
        },
      },
    });
    expect(text(await access.read('docs/notes.md', MAX))).toBe('rejected:path_changed');
  });

  it('檢查後檔案被換成另一個一般檔（rename 蓋過）：path_changed', async () => {
    await world.write('docs/notes.md', 'inside');
    const other = await world.write('other.md', 'OTHER');
    const access = await createNodeFolderAccess(world.project, {
      testHooks: {
        onReadStage: async (s) => {
          if (s === 'checked') await rename(other, path.join(world.project, 'docs', 'notes.md'));
        },
      },
    });
    expect(text(await access.read('docs/notes.md', MAX))).toBe('rejected:path_changed');
  });
});

describe('列舉不跟隨被換掉的資料夾', () => {
  it('子資料夾在發現後、readdir 前被換成外部 symlink：回報為 symlink，不列外部檔名', async () => {
    await world.write('README.md', 'x');
    await world.write('docs/plan.md', 'p');
    await world.write('docs/outside-secret.md', 'SECRET', world.outside);
    const access = await createNodeFolderAccess(world.project, {
      testHooks: {
        beforeReaddir: async (rel) => {
          if (rel === 'docs') await swapDocsToOutside();
        },
      },
    });
    const entries = await access.list();
    expect(entries.map((e) => [e.relPath, e.kind]).sort()).toEqual([
      ['README.md', 'file'],
      ['docs', 'symlink'],
    ]);
  });

  it('子資料夾被換成另一個真資料夾（inode 不同）：回報為 other，不列其內容', async () => {
    await world.write('docs/plan.md', 'p');
    await world.write('elsewhere/moved-in.md', 'm', world.outside);
    const access = await createNodeFolderAccess(world.project, {
      testHooks: {
        beforeReaddir: async (rel) => {
          if (rel !== 'docs') return;
          await rename(path.join(world.project, 'docs'), path.join(world.outside, 'old-docs'));
          await rename(path.join(world.outside, 'elsewhere'), path.join(world.project, 'docs'));
        },
      },
    });
    expect((await access.list()).map((e) => [e.relPath, e.kind])).toEqual([['docs', 'other']]);
  });

  it('根資料夾被換成指向外部的 symlink：list 丟錯，不列外部檔名', async () => {
    await world.write('README.md', 'x');
    await world.write('private.md', 'SECRET', world.outside);
    const access = await createNodeFolderAccess(world.project);
    await rename(world.project, `${world.project}-moved`);
    await symlink(world.outside, world.project);
    await expect(access.list()).rejects.toThrow(/重新選取/);
  });

  it('根資料夾被換成另一個真資料夾：list 丟錯', async () => {
    const access = await createNodeFolderAccess(world.project);
    await rename(world.project, `${world.project}-moved`);
    await mkdir(world.project);
    await world.write('README.md', 'new');
    await expect(access.list()).rejects.toThrow(/重新選取/);
  });
});

describe.runIf(process.env.RUN_RACE === '1')('讀檔競態（真並行，RUN_RACE=1）', () => {
  it('另一個行程反覆把中間資料夾換成外部 symlink：數秒內不會讀到外部內容', async () => {
    await world.write('docs/notes.md', 'inside');
    await world.write('docs/notes.md', 'SECRET-OUTSIDE', world.outside);
    const real = path.join(world.project, 'docs');
    const stash = path.join(world.project, '..', 'docs-real');
    const link = path.join(world.project, '..', 'lnk');
    await symlink(path.join(world.outside, 'docs'), link);
    const flipper = spawn(process.execPath, [
      '-e',
      `const fs=require('fs');const [r,s,l]=${JSON.stringify([real, stash, link])};
       for(;;){try{fs.renameSync(r,s);fs.renameSync(l,r);fs.renameSync(r,l);fs.renameSync(s,r);}catch{}}`,
    ]);
    try {
      const access = await createNodeFolderAccess(world.project);
      const leaks: string[] = [];
      const until = Date.now() + 4000;
      while (Date.now() < until) {
        const r = text(await access.read('docs/notes.md', MAX));
        if (r.includes('SECRET')) leaks.push(r);
      }
      expect(leaks).toEqual([]);
    } finally {
      const exited = new Promise((r) => flipper.once('exit', r));
      flipper.kill();
      await exited;
    }
  }, 15_000);
});
