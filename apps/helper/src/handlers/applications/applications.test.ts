import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BRIDGE_SCHEMAS, type ApplicationRecord, type ExportVersion } from '@rolecraft/contracts';
import {
  createApplicationRecordRepository,
  createExportVersionRepository,
  createLocalFileStore,
  openDatabase,
  type ApplicationRecordRepository,
} from '@rolecraft/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HelperServices } from '../services.ts';
import { applicationsCreate } from './create.ts';
import { applicationsDelete } from './delete.ts';
import { applicationsList } from './list.ts';
import { createApplicationsService, type ApplicationsStore } from './storage-service.ts';
import { applicationsUpdate } from './update.ts';

const EV = '0f8fa5c4-3b1e-4c56-9d1a-7a2b9c3d4e5f';
const EV2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const fields = {
  initiation: 'invited',
  appliedAt: '2026-10-10T16:30:00+08:00',
  status: '已投遞',
  exportVersionId: EV,
} as const;

/** 記憶體版 repository：只實作服務會用到的行為。 */
function fakeStore(knownVersions: string[] = [EV, EV2]) {
  const rows = new Map<string, ApplicationRecord>();
  let seq = 0;
  const applications: ApplicationRecordRepository = {
    create: (input) => {
      const record = { ...input, id: `a-${String(++seq)}` };
      rows.set(record.id, record);
      return record;
    },
    get: (id) => rows.get(id) ?? null,
    list: () => [...rows.values()],
    listByExportVersion: (ev) => [...rows.values()].filter((r) => r.exportVersionId === ev),
    update: (id, changes) => {
      const next = { ...(rows.get(id) as ApplicationRecord), ...changes };
      rows.set(id, next);
      return next;
    },
    delete: (id) => ({
      deleted: rows.delete(id),
      purgedExportVersionIds: [],
      releasedPdfHashes: [],
    }),
  };
  const get = vi.fn((id: string) =>
    knownVersions.includes(id) ? ({ id } as ExportVersion) : null,
  );
  const store: ApplicationsStore = { applications, exportVersions: { get } };
  return { store, rows };
}

function servicesWith(store: ApplicationsStore): HelperServices {
  return { applications: createApplicationsService(store) };
}

function expectValid(op: keyof typeof BRIDGE_SCHEMAS, response: unknown) {
  expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
}

describe('applications handlers（P1-T028）', () => {
  it('沒有服務或服務缺方法：回 not_implemented，不偽造成功', async () => {
    for (const services of [{}, { applications: {} }] as HelperServices[]) {
      const responses = [
        await applicationsList({}, services),
        await applicationsCreate(fields, services),
        await applicationsUpdate({ applicationId: 'a-1', ...fields }, services),
        await applicationsDelete({ applicationId: 'a-1' }, services),
      ];
      for (const r of responses) {
        expect(r).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
      }
    }
  });

  it('新增→列出→修改→整筆刪除', async () => {
    const { store, rows } = fakeStore();
    const services = servicesWith(store);
    const created = await applicationsCreate(fields, services);
    expectValid('applications.create', created);
    expect(created).toEqual({ ok: true, applicationId: 'a-1' });
    // 投遞日期一律存成 UTC
    expect(rows.get('a-1')?.appliedAt).toBe('2026-10-10T08:30:00.000Z');

    const listed = await applicationsList({}, services);
    expectValid('applications.list', listed);
    expect(listed).toMatchObject({
      ok: true,
      applications: [{ id: 'a-1', initiation: 'invited' }],
    });

    const updated = await applicationsUpdate(
      { applicationId: 'a-1', ...fields, initiation: 'proactive', status: '面試中' },
      services,
    );
    expect(updated).toEqual({ ok: true });
    expect(rows.get('a-1')).toMatchObject({ initiation: 'proactive', status: '面試中' });

    expect(await applicationsDelete({ applicationId: 'a-1' }, services)).toEqual({ ok: true });
    expect(rows.size).toBe(0);
  });

  it('實際投出版本不是既有匯出版本：invalid_request，不建立紀錄（R3）', async () => {
    const { store, rows } = fakeStore([]);
    const response = await applicationsCreate(fields, servicesWith(store));
    expectValid('applications.create', response);
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(rows.size).toBe(0);
  });

  it('修改時改指向別的匯出版本：invalid_request，原紀錄不變（R3）', async () => {
    const { store, rows } = fakeStore();
    const services = servicesWith(store);
    await applicationsCreate(fields, services);
    const response = await applicationsUpdate(
      { applicationId: 'a-1', ...fields, exportVersionId: EV2, status: '改過' },
      services,
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(rows.get('a-1')).toMatchObject({ exportVersionId: EV, status: '已投遞' });
  });

  it('查不到的投遞紀錄：修改與刪除都回 invalid_request，訊息不回填請求內容', async () => {
    const { store } = fakeStore();
    const services = servicesWith(store);
    const responses = [
      await applicationsUpdate({ applicationId: 'evil-id', ...fields }, services),
      await applicationsDelete({ applicationId: 'evil-id' }, services),
    ];
    for (const r of responses) {
      expect(r).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
      expect(JSON.stringify(r)).not.toContain('evil-id');
    }
  });
});

describe('createApplicationsService 接真實 storage', () => {
  let cleanup = () => undefined as void;
  afterEach(() => cleanup());

  it('空資料庫：列出為空；指向不存在的匯出版本不能新增；查不到的紀錄不能改或刪', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-applications-'));
    const { db } = openDatabase(path.join(dir, 'rolecraft.db'));
    cleanup = () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    };
    const files = createLocalFileStore(path.join(dir, 'files'));
    const applications = createApplicationRecordRepository(db, files);
    const service = createApplicationsService({
      applications,
      exportVersions: createExportVersionRepository(db, files),
    });
    const services: HelperServices = { applications: service };

    expect(await applicationsList({}, services)).toEqual({ ok: true, applications: [] });
    expect(await applicationsCreate(fields, services)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(await applicationsUpdate({ applicationId: EV, ...fields }, services)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(await applicationsDelete({ applicationId: EV }, services)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(applications.list()).toEqual([]);
  });
});
