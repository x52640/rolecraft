/** codex 補審（ca51f0e）回歸：掃子層時根被換、單層筆數上限。 */
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeWorld, type TmpWorld } from './__fixtures__/tmp-folder.ts';

const counter = vi.hoisted(() => ({ lstat: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
      counter.lstat += 1;
      return actual.lstatSync(...args);
    }) as typeof actual.lstatSync,
  };
});

const { createNodeFolderAccess } = await import('./node-folder-access.ts');

let world: TmpWorld;
beforeEach(async () => {
  world = await makeWorld();
});
afterEach(async () => {
  await world.cleanup();
});

describe('codex 補審（P1-T036）', () => {
  it('掃子層前根資料夾被換成同結構的新資料夾：list 丟錯，不回傳部分結果', async () => {
    await world.write('a.md', 'x');
    await world.write('sub/b.md', 'y');
    const access = await createNodeFolderAccess(world.project, {
      testHooks: {
        beforeReaddir: async () => {
          await rename(world.project, `${world.project}-old`);
          await mkdir(path.join(world.project, 'sub'), { recursive: true });
        },
      },
    });
    await expect(access.list()).rejects.toThrow(/重新選取/);
  });

  it('單層項目很多時，收滿 maxEntries 就停止 lstat', async () => {
    for (let i = 0; i < 300; i += 1) await world.write(`f${i}.md`, '');
    const access = await createNodeFolderAccess(world.project, { maxEntries: 1 });
    counter.lstat = 0;
    expect(await access.list()).toHaveLength(1);
    expect(counter.lstat).toBeLessThan(20);
  });
});
