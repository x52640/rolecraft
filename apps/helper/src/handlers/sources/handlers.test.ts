// sources.* handler：服務結果 → 橋接回應（皆須符合 contracts schema），失敗訊息是固定文字。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BRIDGE_SCHEMAS, type BridgeOperation } from '@rolecraft/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatch } from '../../bridge/dispatch.ts';
import type { HelperServices } from '../services.ts';
import { createSourcesService } from './local-sources.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-t021-h-'));
  tempDirs.push(dir);
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'README.md'), '# hi');
  writeFileSync(path.join(dir, 'docs', 'plan.md'), 'plan');
  return dir;
}

async function call(services: HelperServices, op: BridgeOperation, payload: unknown) {
  const { response } = await dispatch({ op, payload }, services, { log: () => {} });
  expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
  return response as Record<string, unknown>;
}

const failure = (code: string) => ({
  ok: false,
  error: { code, message: expect.any(String) as unknown },
});

describe('sources.* handlers', () => {
  it('完整流程：選取 → 清單 → 預覽 → 授權 → 移除', async () => {
    const dir = project();
    const services: HelperServices = {
      sources: createSourcesService({ picker: () => Promise.resolve([dir]) }),
    };
    const picked = await call(services, 'sources.pick_folders', {});
    const selection = picked.selection as { status: string; roots: { rootId: string }[] };
    expect(selection.status).toBe('selected');
    const rootId = selection.roots[0]?.rootId ?? '';
    expect(JSON.stringify(picked)).not.toContain(dir);

    const list = await call(services, 'sources.list_folders', {});
    expect(list).toEqual({
      ok: true,
      roots: [{ rootId, name: path.basename(dir), pendingCount: 2, authorizedCount: 0 }],
    });

    const preview = await call(services, 'sources.preview', { rootId });
    const entries = preview.entries as { entryId: string; name: string }[];
    expect(JSON.stringify(preview)).not.toContain(dir);
    const readme = entries.find((e) => e.name === 'README.md')?.entryId ?? '';

    const ack = await call(services, 'sources.update_authorization', {
      rootId,
      authorize: [readme],
      revoke: [],
    });
    expect(ack).toEqual({ ok: true });
    expect(await call(services, 'sources.remove_folder', { rootId })).toEqual({ ok: true });
    expect(await call(services, 'sources.preview', { rootId })).toEqual(failure('invalid_request'));
  });

  it('不合法的項目與資料夾回 invalid_request，訊息不回填請求內容', async () => {
    const dir = project();
    const services: HelperServices = {
      sources: createSourcesService({ picker: () => Promise.resolve([dir]) }),
    };
    const picked = await call(services, 'sources.pick_folders', {});
    const rootId = (picked.selection as { roots: { rootId: string }[] }).roots[0]?.rootId ?? '';
    const bad = await call(services, 'sources.update_authorization', {
      rootId,
      authorize: ['zzz-unknown'],
      revoke: [],
    });
    expect(bad).toEqual(failure('invalid_request'));
    expect(JSON.stringify(bad)).not.toContain('zzz-unknown');
    const missing = await call(services, 'sources.remove_folder', { rootId: 'zzz-root' });
    expect(missing).toEqual(failure('invalid_request'));
    expect(JSON.stringify(missing)).not.toContain('zzz-root');
  });

  it('請求帶路徑欄位一律被 schema 擋下，不會到服務', async () => {
    let called = false;
    const services: HelperServices = {
      sources: {
        pickFolders: () => {
          called = true;
          return Promise.resolve({ status: 'cancelled' });
        },
      },
    };
    expect(await call(services, 'sources.pick_folders', { path: '/etc' })).toEqual(
      failure('invalid_request'),
    );
    expect(called).toBe(false);
  });

  it('取消、忙碌、無法讀取的資料夾', async () => {
    const services: HelperServices = {
      sources: {
        pickFolders: () => Promise.resolve({ status: 'busy' }),
        preview: () => Promise.resolve({ status: 'unreadable' }),
      },
    };
    expect(await call(services, 'sources.pick_folders', {})).toEqual(failure('invalid_request'));
    expect(await call(services, 'sources.preview', { rootId: 'r1' })).toEqual(
      failure('internal_error'),
    );
    const cancelled: HelperServices = {
      sources: { pickFolders: () => Promise.resolve({ status: 'cancelled' }) },
    };
    expect(await call(cancelled, 'sources.pick_folders', {})).toEqual({
      ok: true,
      selection: { status: 'cancelled' },
    });
  });

  it('選取器沒接上（helper 預設組裝）：pick_folders 回 not_implemented，其餘可用', async () => {
    const services: HelperServices = { sources: createSourcesService() };
    expect(await call(services, 'sources.pick_folders', {})).toEqual(failure('not_implemented'));
    expect(await call(services, 'sources.list_folders', {})).toEqual({ ok: true, roots: [] });
  });
});
