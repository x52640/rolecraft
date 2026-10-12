// 專案分組建議與歸屬規則（P1-T063，D23）：輸出驗證、提示隔離、預算、歸屬。一律假 provider。
import type { Claim } from '@rolecraft/contracts';
import {
  createFakeAdapter,
  runWithSubscriptionCheck,
  type FakeAdapterOptions,
  type FakeStep,
} from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import { documentNameOf } from '../prompts/project-prompt.ts';
import { projectForClaim } from './assignment.ts';
import { GROUPING_LIMITS, parseGroupingOutput } from './output.ts';
import { prepareGrouping, runGrouping, type GroupingDocument } from './suggest.ts';

let seq = 0;
/** 界線標記候選（16 個英數以上） */
const randomUUID = () => `boundary${String(++seq).padStart(12, '0')}`;

const KNOWN = new Set(['D1', 'D2', 'D3']);
const json = (value: unknown) => JSON.stringify(value);

describe('parseGroupingOutput', () => {
  it('合法：組名去頭尾空白；可包一層 ```json', () => {
    const raw =
      '```json\n' + json({ groups: [{ name: ' 甲 ', documents: ['D1', 'D3'] }] }) + '\n```';
    expect(parseGroupingOutput(raw, KNOWN)).toEqual({
      ok: true,
      groups: [{ name: '甲', labels: ['D1', 'D3'] }],
    });
    expect(parseGroupingOutput(json({ groups: [] }), KNOWN)).toEqual({ ok: true, groups: [] });
  });

  const bad: [string, string][] = [
    ['未知編號', json({ groups: [{ name: 'x', documents: ['D4'] }] })],
    ['同組重複', json({ groups: [{ name: 'x', documents: ['D1', 'D1'] }] })],
    [
      '跨組重複',
      json({
        groups: [
          { name: 'x', documents: ['D1'] },
          { name: 'y', documents: ['D1'] },
        ],
      }),
    ],
    ['多餘欄位', json({ groups: [], note: '已執行' })],
    ['組多餘欄位', json({ groups: [{ name: 'x', documents: ['D1'], path: '/etc' }] })],
    ['缺 groups', json({})],
    ['空組', json({ groups: [{ name: 'x', documents: [] }] })],
    ['空白組名', json({ groups: [{ name: '  ', documents: ['D1'] }] })],
    ['組名含換行', json({ groups: [{ name: 'a\nb', documents: ['D1'] }] })],
    [
      '組名過長',
      json({ groups: [{ name: 'x'.repeat(GROUPING_LIMITS.name + 1), documents: ['D1'] }] }),
    ],
    ['編號不是字串', json({ groups: [{ name: 'x', documents: [1] }] })],
    ['__proto__', '{"groups":[],"__proto__":{"x":1}}'],
    ['前後有文字', `好的：${json({ groups: [] })}`],
  ];
  it.each(bad)('不合格（%s）整份不採用', (_name, raw) => {
    expect(parseGroupingOutput(raw, KNOWN).ok).toBe(false);
  });
});

const docs: GroupingDocument[] = [
  { sourceDocumentId: 'doc-a', relPath: 'a/README.md', summary: '甲的摘要' },
  { sourceDocumentId: 'doc-b', relPath: '/notes\n.md', summary: '乙的摘要' },
];
const budget = {
  contextLimit: 200_000,
  outputReserve: 0,
  toolOverheadReserve: 0,
  available: 200_000,
};

describe('prepareGrouping', () => {
  it('提示只用本機編號與相對名稱，不含來源文件 ID；名稱去掉開頭斜線與控制字元', () => {
    const result = prepareGrouping(docs, budget, randomUUID);
    if (!result.ok) throw new Error(result.reason);
    const { prompt, documents } = result.prepared;
    expect([...documents.keys()]).toEqual(['D1', 'D2']);
    expect(documents.get('D2')).toEqual({ sourceDocumentId: 'doc-b', name: 'notes .md' });
    expect(prompt).toContain('a/README.md');
    expect(prompt).not.toContain('doc-a');
    expect(prompt).not.toContain('/notes');
    expect(documentNameOf('   ')).toBe('（未命名）');
  });

  it('沒有文件、超過預算：不送出', () => {
    expect(prepareGrouping([], budget, randomUUID)).toEqual({ ok: false, reason: 'no_documents' });
    expect(prepareGrouping(docs, { ...budget, available: 10 }, randomUUID)).toEqual({
      ok: false,
      reason: 'over_budget',
    });
  });

  it('界線標記撞到資料就換；換不到不送出', () => {
    const tricky = [{ ...docs[0], summary: 'AAAAAAAAAAAAAAAA' } as GroupingDocument];
    expect(() => prepareGrouping(tricky, budget, () => 'AAAAAAAAAAAAAAAA')).toThrow();
  });
});

function run(step: FakeStep, route: FakeAdapterOptions['route'] = {}) {
  const prepared = prepareGrouping(docs, budget, randomUUID);
  if (!prepared.ok) throw new Error(prepared.reason);
  const records: unknown[] = [];
  const promise = runGrouping(prepared.prepared, {
    provider: 'claude',
    model: 'fake-model',
    signal: 'signal',
    execute: ({ prompt }) =>
      runWithSubscriptionCheck(
        createFakeAdapter({ script: [step], route }),
        { model: 'fake-model', prompt, trigger: 'run_start' },
        { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'run-check' },
      ),
    recordRunCheck: (record) => {
      records.push(record);
      return Promise.resolve();
    },
  });
  return { promise, records };
}

describe('runGrouping', () => {
  it('合法輸出：編號換回文件，沒分到的列未分組；R6 紀錄交出', async () => {
    const { promise, records } = run({
      text: json({ groups: [{ name: '甲', documents: ['D1'] }] }),
    });
    expect(await promise).toEqual({
      ok: true,
      groups: [{ name: '甲', documents: [{ sourceDocumentId: 'doc-a', name: 'a/README.md' }] }],
      ungrouped: [{ sourceDocumentId: 'doc-b', name: 'notes .md' }],
    });
    expect(records).toHaveLength(1);
  });

  it('不合格輸出、R6 不通過、額度用完：回對應失敗', async () => {
    expect(
      await run({ text: json({ groups: [{ name: 'x', documents: ['D9'] }] }) }).promise,
    ).toEqual({ ok: false, reason: 'invalid_output' });
    const failed = { outcome: 'failed', basis: 'API key' } as const;
    const blocked = run({ text: '{}' }, { subscriptionLogin: failed });
    expect(await blocked.promise).toEqual({ ok: false, reason: 'run_check_failed' });
    expect(blocked.records).toHaveLength(1);
    expect(await run({ error: 'quota_exhausted' }).promise).toEqual({
      ok: false,
      reason: 'quota_exhausted',
    });
    expect(await run({ error: 'other' }).promise).toEqual({
      ok: false,
      reason: 'provider_error',
    });
  });
});

describe('projectForClaim', () => {
  const claimFrom = (...docIds: string[]): Claim => ({
    id: 'c',
    type: 'personal_role',
    text: '負責後端',
    basis: {
      sourceExcerpts: docIds.map((sourceDocumentId) => ({
        sourceDocumentId,
        contentVersion: 1,
        contentHash: 'a'.repeat(64),
        location: 'tb2:0:1/1:x',
        text: '負責後端',
      })),
      userConfirmation: null,
    },
    reviewStatus: 'normal',
  });
  const owners = new Map([
    ['d1', 'p1'],
    ['d2', 'p1'],
    ['d3', 'p2'],
  ]);
  const projectOf = (id: string) => owners.get(id) ?? null;

  it('來源都在同一專案才歸入；跨專案、有不屬專案的來源、沒有來源都不歸', () => {
    expect(projectForClaim(claimFrom('d1', 'd2', 'd1'), projectOf)).toBe('p1');
    expect(projectForClaim(claimFrom('d1', 'd3'), projectOf)).toBeNull();
    expect(projectForClaim(claimFrom('d1', 'd9'), projectOf)).toBeNull();
    expect(projectForClaim(claimFrom(), projectOf)).toBeNull();
  });
});
