// P1-T058：helper 狀態持久化的 repository（授權資料夾、讀檔紀錄、選定模型、Claude 版本紀錄）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { T, tempDatabase } from '../__fixtures__/entities.ts';
import { openDatabase } from '../database.ts';
import { StorageError } from '../errors.ts';
import { createRepositories, type Repositories } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let repos: Repositories;

beforeEach(() => {
  t = tempDatabase();
  repos = createRepositories(t.db);
});
afterEach(() => t.cleanup());

const folder = {
  id: 'f1',
  absolutePath: '/Users/x/proj',
  displayName: 'proj',
  authorizedAt: T,
  identity: { realPath: '/Users/x/proj', dev: '16777230', ino: '18446744073709551615' },
};

describe('authorizedFolders', () => {
  it('新增、存文件狀態、重開資料庫後原樣讀回（ID 不變）', () => {
    repos.authorizedFolders.add(folder);
    repos.authorizedFolders.saveItems('f1', [
      { id: 'i1', relPath: 'README.md', sizeBytes: 10, status: 'authorized' },
      { id: 'i2', relPath: 'docs/a.md', sizeBytes: 0, status: 'revoked' },
    ]);
    repos.authorizedFolders.saveItems('f1', [
      { id: 'i1', relPath: 'README.md', sizeBytes: 12, status: 'revoked' },
    ]);
    t.db.close();
    const reopened = createRepositories(openDatabase(t.file).db);
    expect(reopened.authorizedFolders.list()).toEqual([
      {
        ...folder,
        items: [
          { id: 'i1', relPath: 'README.md', sizeBytes: 12, status: 'revoked' },
          { id: 'i2', relPath: 'docs/a.md', sizeBytes: 0, status: 'revoked' },
        ],
      },
    ]);
  });

  it('同一路徑不能加兩次', () => {
    repos.authorizedFolders.add(folder);
    expect(() => repos.authorizedFolders.add({ ...folder, id: 'f2' })).toThrow(/UNIQUE/);
  });

  it('文件 ID 對到別的路徑或資料夾不存在：整筆不寫', () => {
    repos.authorizedFolders.add(folder);
    repos.authorizedFolders.saveItems('f1', [
      { id: 'i1', relPath: 'a.md', sizeBytes: 1, status: 'authorized' },
    ]);
    expect(() =>
      repos.authorizedFolders.saveItems('f1', [
        { id: 'i2', relPath: 'b.md', sizeBytes: 1, status: 'authorized' },
        { id: 'i1', relPath: 'other.md', sizeBytes: 1, status: 'revoked' },
      ]),
    ).toThrow(StorageError);
    expect(repos.authorizedFolders.list()[0]?.items).toEqual([
      { id: 'i1', relPath: 'a.md', sizeBytes: 1, status: 'authorized' },
    ]);
    expect(() =>
      repos.authorizedFolders.saveItems('nope', [
        { id: 'i9', relPath: 'a.md', sizeBytes: 1, status: 'authorized' },
      ]),
    ).toThrow(StorageError);
  });

  it('移除資料夾連同文件；讀檔紀錄保留', () => {
    repos.authorizedFolders.add(folder);
    repos.authorizedFolders.saveItems('f1', [
      { id: 'i1', relPath: 'a.md', sizeBytes: 1, status: 'authorized' },
    ]);
    const entry = { itemId: 'i1', folderId: 'f1', relPath: 'a.md', readAt: T, contentHash: 'h' };
    repos.sourceReadLog.append(entry);
    expect(repos.authorizedFolders.remove('f1')).toBe(true);
    expect(repos.authorizedFolders.remove('f1')).toBe(false);
    expect(repos.authorizedFolders.list()).toEqual([]);
    expect(repos.sourceReadLog.list()).toEqual([entry]);
  });

  it('status 只接受 authorized／revoked', () => {
    repos.authorizedFolders.add(folder);
    expect(() =>
      t.db
        .prepare(
          "INSERT INTO authorized_folder_items (id, folder_id, rel_path, size_bytes, status) VALUES ('x', 'f1', 'a', 0, 'pending')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe('authorizedFolders clearItems', () => {
  it('清掉資料夾下的文件狀態，資料夾與身分保留', () => {
    repos.authorizedFolders.add(folder);
    repos.authorizedFolders.saveItems('f1', [
      { id: 'i1', relPath: 'a.md', sizeBytes: 1, status: 'authorized' },
    ]);
    repos.authorizedFolders.clearItems('f1');
    expect(repos.authorizedFolders.list()).toEqual([{ ...folder, items: [] }]);
  });
});

describe('sourceReadLog（只增不刪）', () => {
  it('依新增順序列出；UPDATE、DELETE 一律被擋', () => {
    const a = { itemId: 'i1', folderId: 'f1', relPath: 'a.md', readAt: T, contentHash: 'h1' };
    const b = { ...a, contentHash: 'h2' };
    repos.sourceReadLog.append(a);
    repos.sourceReadLog.append(b);
    expect(repos.sourceReadLog.list()).toEqual([a, b]);
    expect('delete' in repos.sourceReadLog).toBe(false);
    expect(() => t.db.exec("UPDATE source_read_log SET content_hash = 'x'")).toThrow(/append-only/);
    expect(() => t.db.exec('DELETE FROM source_read_log')).toThrow(/append-only/);
    expect(repos.sourceReadLog.list()).toEqual([a, b]);
  });
});

describe('providerSelections', () => {
  it('存模型別名，新選定覆蓋舊的', () => {
    expect(repos.providerSelections.get('claude')).toBeNull();
    repos.providerSelections.save('claude', 'sonnet', T);
    repos.providerSelections.save('claude', 'opus', T);
    expect(repos.providerSelections.get('claude')).toBe('opus');
    expect(repos.providerSelections.get('codex')).toBeNull();
  });
});

describe('claudeVersionRecords', () => {
  it('依新增順序保存原始 JSON；不可修改', () => {
    repos.claudeVersionRecords.append('{"a":1}', T);
    repos.claudeVersionRecords.append('{"a":2}', T);
    expect(repos.claudeVersionRecords.list()).toEqual(['{"a":1}', '{"a":2}']);
    expect(() => repos.claudeVersionRecords.append('not json', T)).toThrow(/CHECK/);
    expect(() => t.db.exec("UPDATE claude_version_records SET data = '{}'")).toThrow(/append-only/);
  });
});
