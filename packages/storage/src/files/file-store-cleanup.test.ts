import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const failures = vi.hoisted(() => ({ rename: false, rm: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (failures.rename) throw Object.assign(new Error('rename failed'), { code: 'EXDEV' });
      return actual.renameSync(...args);
    },
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (failures.rm) throw Object.assign(new Error('rm denied'), { code: 'EACCES' });
      return actual.rmSync(...args);
    },
  };
});

const { createLocalFileStore, fileStoreInternals } = await import('./file-store.ts');

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'rolecraft-files-'));
});
afterEach(() => {
  failures.rename = false;
  failures.rm = false;
  rmSync(root, { recursive: true, force: true });
});

describe('codex 補審（P1-T036）', () => {
  it('清暫存檔失敗不蓋掉原錯誤（79ac0cd）', () => {
    const store = createLocalFileStore(root);
    failures.rename = true;
    failures.rm = true;
    expect(() => store.put(new Uint8Array([1, 2, 3]))).toThrow('rename failed');
  });

  it('清掃遇到 .DS_Store 等非目錄不崩潰（50c8639）', () => {
    const store = createLocalFileStore(root);
    const { hash } = store.put(new Uint8Array([1, 2, 3]));
    writeFileSync(path.join(root, 'sha256', '.DS_Store'), '');
    writeFileSync(path.join(root, 'sha256', 'ab'), 'not a dir');
    expect(fileStoreInternals(store).listHashes()).toEqual([hash]);
  });
});
