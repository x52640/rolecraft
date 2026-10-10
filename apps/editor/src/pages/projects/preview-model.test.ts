import type { SourceEntry } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildTree,
  documentIds,
  initialChecked,
  planChanges,
  suggestedIds,
  toBatches,
} from './preview-model.ts';

function doc(
  entryId: string,
  name: string,
  parentEntryId: string | null,
  authorization: SourceEntry['authorization'] = 'pending',
  suggested = false,
): SourceEntry {
  return {
    entryId,
    parentEntryId,
    name,
    kind: 'document',
    sizeBytes: 10,
    format: 'md',
    authorization,
    suggested,
  };
}

function dir(entryId: string, name: string, parentEntryId: string | null = null): SourceEntry {
  return {
    entryId,
    parentEntryId,
    name,
    kind: 'container',
    sizeBytes: null,
    format: '',
    authorization: null,
    suggested: false,
  };
}

const ENTRIES = [
  doc('readme', 'README.md', null, 'authorized', true),
  dir('docs', 'docs'),
  dir('adr', 'adr', 'docs'),
  doc('spec', 'spec.md', 'docs', 'pending', true),
  doc('old', 'old.md', 'adr', 'revoked'),
  doc('new', 'new.md', 'adr', 'pending'),
];

describe('buildTree', () => {
  it('子資料夾在前、依名稱排序，以上層 ID 相連', () => {
    const tree = buildTree(ENTRIES);
    expect(tree.map((n) => n.entry.name)).toEqual(['docs', 'README.md']);
    const docs = tree[0];
    expect(docs?.children.map((n) => n.entry.name)).toEqual(['adr', 'spec.md']);
    expect(docs && documentIds(docs).sort()).toEqual(['new', 'old', 'spec']);
  });

  it('找不到上層的項目放最上層；自我參照不會無限遞迴', () => {
    const tree = buildTree([
      doc('x', 'x.md', 'missing'),
      { ...dir('loop', 'loop'), parentEntryId: 'loop' },
    ]);
    expect(tree.map((n) => n.entry.entryId)).toEqual(['x']);
  });
});

describe('勾選與變更', () => {
  it('初始只勾已授權；待確認不預先勾選', () => {
    expect([...initialChecked(ENTRIES)]).toEqual(['readme']);
  });

  it('建議文件只由按鈕勾選', () => {
    expect(suggestedIds(ENTRIES)).toEqual(['readme', 'spec']);
  });

  it('勾選且未授權 → 授權；未勾選且未標不納入 → 撤銷', () => {
    const checked = new Set(['spec', 'old']);
    expect(planChanges(ENTRIES, checked)).toEqual({
      authorize: ['spec', 'old'],
      revoke: ['readme', 'new'],
    });
    expect(planChanges(ENTRIES, new Set(['readme']))).toEqual({
      authorize: [],
      revoke: ['spec', 'new'],
    });
  });

  it('批次：不超過上限，先撤銷再授權', () => {
    expect(toBatches({ authorize: ['a', 'b', 'c'], revoke: ['x'] }, 2)).toEqual([
      { authorize: [], revoke: ['x'] },
      { authorize: ['a', 'b'], revoke: [] },
      { authorize: ['c'], revoke: [] },
    ]);
    expect(toBatches({ authorize: [], revoke: [] })).toEqual([]);
  });
});
