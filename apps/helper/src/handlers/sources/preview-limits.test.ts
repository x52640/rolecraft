// 對抗驗證修正：沒有可見字元的名稱、預覽回應過大。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BRIDGE_SCHEMAS, type SourceEntry } from '@rolecraft/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dispatch } from '../../bridge/dispatch.ts';
import { createSourcesService, type LocalSources } from './local-sources.ts';
import { UNNAMED_ENTRY } from './preview-tree.ts';

let base: string;
beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'rolecraft-t021-l-'));
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function write(rel: string, content = 'text'): void {
  const full = path.join(base, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

async function pickOne(service: LocalSources): Promise<string> {
  const result = await service.pickFolders?.();
  if (result?.status !== 'selected') throw new Error('not selected');
  return result.roots[0]?.rootId ?? '';
}

const silent = { log: () => {} };

describe('沒有可見字元的名稱', () => {
  it.each([
    ['半形空白', ' '],
    ['全形空白 U+3000', '　'],
  ])('子資料夾名為%s：用替代名稱，回應通過 schema', async (_label, blank) => {
    write(`p/README.md`);
    write(`p/${blank}/plan.md`);
    const service = createSourcesService({ picker: () => Promise.resolve([path.join(base, 'p')]) });
    const rootId = await pickOne(service);
    const { response } = await dispatch(
      { op: 'sources.preview', payload: { rootId } },
      { sources: service },
      silent,
    );
    expect(BRIDGE_SCHEMAS['sources.preview'].response.safeParse(response).success).toBe(true);
    const entries = (response as { ok: true; entries: SourceEntry[] }).entries;
    const container = entries.find((e) => e.kind === 'container');
    expect(container?.name).toBe(UNNAMED_ENTRY);
    const plan = entries.find((e) => e.name === 'plan.md');
    expect(plan?.parentEntryId).toBe(container?.entryId);
    // 預覽成功，所以可以授權
    expect(service.updateAuthorization?.(rootId, [plan?.entryId ?? ''], [])).toBe('ok');
  });
});

describe('預覽回應過大', () => {
  it('約 5000 個檔：回固定的 invalid_request（提示改選子資料夾），不是 internal_error', async () => {
    for (let i = 0; i < 5000; i += 1) {
      write(`big/docs/section-${String(i).padStart(4, '0')}-meeting-notes-and-decisions.md`);
    }
    const service = createSourcesService({
      picker: () => Promise.resolve([path.join(base, 'big')]),
    });
    const rootId = await pickOne(service);
    const { response } = await dispatch(
      { op: 'sources.preview', payload: { rootId } },
      { sources: service },
      silent,
    );
    expect(response).toEqual({
      ok: false,
      error: { code: 'invalid_request', message: expect.stringContaining('子資料夾') as unknown },
    });
  });

  it('過大時不替換最近一次預覽：先前預覽過的項目仍可授權，新檔不行', async () => {
    write('p/README.md');
    const service = createSourcesService({
      picker: () => Promise.resolve([path.join(base, 'p')]),
      maxPreviewBytes: 600,
    });
    const rootId = await pickOne(service);
    const first = await service.preview?.(rootId);
    if (first?.status !== 'ok') throw new Error('preview failed');
    const readme = first.entries[0]?.entryId ?? '';

    for (let i = 0; i < 5; i += 1) write(`p/plan-${i}.md`);
    expect(await service.preview?.(rootId)).toEqual({ status: 'too_large' });
    const fresh = service.registry
      .items(rootId)
      .filter((item) => item.id !== readme)
      .map((item) => item.id);
    expect(fresh).toHaveLength(5);
    expect(service.updateAuthorization?.(rootId, fresh, [])).toBe('invalid_entry');
    expect(service.updateAuthorization?.(rootId, [readme], [])).toBe('ok');
  });
});
