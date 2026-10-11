import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readFolderIdentity, sameFolderIdentity } from './folder-identity.ts';

let base: string;
beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'rolecraft-identity-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('readFolderIdentity', () => {
  it('同一資料夾身分相同；換成符號連結或另一個同名資料夾就不同', async () => {
    const project = path.join(base, 'proj');
    const other = path.join(base, 'other');
    mkdirSync(project);
    mkdirSync(other);
    const before = await readFolderIdentity(project);
    expect(sameFolderIdentity(before, await readFolderIdentity(project))).toBe(true);

    renameSync(project, `${project}-old`);
    symlinkSync(other, project);
    expect(sameFolderIdentity(before, await readFolderIdentity(project))).toBe(false);

    rmSync(project);
    mkdirSync(project);
    expect(sameFolderIdentity(before, await readFolderIdentity(project))).toBe(false);
  });

  it('不存在或不是資料夾：丟錯', async () => {
    await expect(readFolderIdentity(path.join(base, 'missing'))).rejects.toThrow();
    const file = path.join(base, 'file');
    writeFileSync(file, 'x');
    await expect(readFolderIdentity(file)).rejects.toThrow();
  });
});
