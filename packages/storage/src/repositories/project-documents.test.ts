// P1-T063：專案包含哪些文件（每份文件至多屬一個專案；刪專案一併移除歸屬）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tempDatabase } from '../__fixtures__/entities.ts';
import { createRepositories, type Repositories } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let repos: Repositories;

beforeEach(() => {
  t = tempDatabase();
  repos = createRepositories(t.db);
  for (const id of ['p1', 'p2']) {
    repos.projectEvidence.save({ id, name: id, summary: '', claimIds: [] });
  }
});
afterEach(() => t.cleanup());

describe('projectDocuments', () => {
  it('加入、查詢、合併搬移；同一文件不能屬兩個專案', () => {
    repos.projectDocuments.add('p1', 'd1');
    repos.projectDocuments.add('p2', 'd2');
    expect(repos.projectDocuments.projectOf('d1')).toBe('p1');
    expect(repos.projectDocuments.projectOf('d9')).toBeNull();
    expect(() => repos.projectDocuments.add('p2', 'd1')).toThrow();
    repos.projectDocuments.moveAll('p2', 'p1');
    expect(repos.projectDocuments.listByProject('p1')).toEqual(['d1', 'd2']);
    expect([...repos.projectDocuments.all()]).toEqual([
      ['d1', 'p1'],
      ['d2', 'p1'],
    ]);
  });

  it('專案刪除時歸屬一併移除；不存在的專案不能加入', () => {
    repos.projectDocuments.add('p1', 'd1');
    repos.projectEvidence.delete('p1');
    expect(repos.projectDocuments.projectOf('d1')).toBeNull();
    expect(() => repos.projectDocuments.add('missing', 'd1')).toThrow();
  });
});
