import { BRIDGE_SCHEMAS, type Profile, type ProfileInput } from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { HANDLERS } from '../registry.ts';
import type { HelperServices } from '../services.ts';
import {
  CHINESE_RESUME,
  ENGLISH_RESUME,
  makeChinesePdf,
  makeImageOnlyPdf,
  makeTextPdf,
} from './__fixtures__/pdf.ts';
import { createResumeImportService, type PickedPdf } from './import-service.ts';

const PROFILE: ProfileInput = {
  personalInfo: { 姓名: '王小明' },
  experiences: [
    {
      company: '宏碁股份有限公司',
      title: '資深工程師',
      startDate: '2019/03',
      endDate: null,
      description: '負責付款系統',
    },
  ],
  skills: ['TypeScript'],
};

function setup(picks: (PickedPdf | null)[]) {
  const { db } = openDatabase(':memory:');
  const { profiles } = createRepositories(db);
  let n = 0;
  const service = createResumeImportService({
    picker: () => Promise.resolve(picks.shift() ?? null),
    profiles,
    newId: () => `id-${String((n += 1))}`,
  });
  const services: HelperServices = { resumeImport: service };
  async function call(op: keyof typeof HANDLERS, payload: unknown): Promise<unknown> {
    const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
    const response = await handler(payload, services);
    // 回應一定要符合 contracts schema（dispatch 也會再驗一次）。
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    return response;
  }
  return { profiles, call, service };
}

const pdf = (fileName: string, bytes: Uint8Array): PickedPdf => ({ fileName, bytes });

describe('import.*（P1-T020）', () => {
  it('選檔 → 解析英文 PDF：回 importId 與檔名，原文與欄位草稿附出處', async () => {
    const { call } = setup([pdf('resume.pdf', makeTextPdf(ENGLISH_RESUME))]);
    const picked = await call('import.pick_pdf', {});
    expect(picked).toEqual({
      ok: true,
      selection: { status: 'selected', importId: 'id-1', displayName: 'resume.pdf' },
    });
    const got = (await call('import.get', { importId: 'id-1' })) as {
      result: { status: string; pages: { lines: string[] }[]; draft: Record<string, unknown> };
    };
    expect(got.result.status).toBe('parsed');
    expect(got.result.pages[0]?.lines).toContain('Name: Alice Chen');
    expect(got.result.draft.name).toEqual({ value: 'Alice Chen', pageNumber: 1, lineIndex: 0 });
    expect(got.result.draft.companies).toEqual([
      { value: 'Acme Inc.', pageNumber: 1, lineIndex: 2 },
    ]);
  });

  it('中文 PDF（CID 字型）也能解析出姓名與公司', async () => {
    const { call } = setup([pdf('履歷.pdf', makeChinesePdf(CHINESE_RESUME))]);
    await call('import.pick_pdf', {});
    const got = (await call('import.get', { importId: 'id-1' })) as {
      result: { status: string; draft: { name: { value: string } | null; companies: unknown[] } };
    };
    expect(got.result.status).toBe('parsed');
    expect(got.result.draft.name?.value).toBe('王小明');
    expect(got.result.draft.companies).toHaveLength(1);
  });

  it.each([
    ['沒有文字層（掃描檔）', makeImageOnlyPdf(), 'no_text_layer'],
    ['不是 PDF', new TextEncoder().encode('hello'), 'invalid_pdf'],
  ])('%s：回失敗原因，不當成成功；仍可確認手動輸入（D18）', async (_name, bytes, reason) => {
    const { call, profiles } = setup([pdf('scan.pdf', bytes)]);
    await call('import.pick_pdf', {});
    expect(await call('import.get', { importId: 'id-1' })).toEqual({
      ok: true,
      result: { status: 'failed', displayName: 'scan.pdf', reason },
    });
    const confirmed = await call('import.confirm', { importId: 'id-1', profile: PROFILE });
    expect(confirmed).toEqual({ ok: true, profileId: 'id-2' });
    expect(profiles.get('id-2')?.pdfParseConfirmed).toBe(true);
  });

  it('解析器內部錯誤也當成無法解析，不中斷流程', async () => {
    const service = createResumeImportService({
      picker: () => Promise.resolve(pdf('a.pdf', new Uint8Array([1]))),
      profiles: { save: (p) => p, list: () => [] },
      extract: () => Promise.reject(new Error('boom')),
      newId: () => 'x1',
    });
    await service.pickPdf?.();
    expect(service.get?.('x1')).toMatchObject({ status: 'failed', reason: 'invalid_pdf' });
  });

  it('使用者取消：回 cancelled，不配發 importId', async () => {
    const { call } = setup([null]);
    expect(await call('import.pick_pdf', {})).toEqual({
      ok: true,
      selection: { status: 'cancelled' },
    });
    expect(await call('import.get', { importId: 'id-1' })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
  });

  it('顯示名稱只留檔名，不帶上層路徑', async () => {
    const { call } = setup([pdf('/Users/me/Documents/cv.pdf', makeTextPdf(ENGLISH_RESUME))]);
    const picked = (await call('import.pick_pdf', {})) as { selection: { displayName: string } };
    expect(picked.selection.displayName).toBe('cv.pdf');
    const got = await call('import.get', { importId: 'id-1' });
    expect(JSON.stringify(got)).not.toContain('/Users');
  });

  it('同時只開一個選取視窗', async () => {
    let release: (value: PickedPdf | null) => void = () => {};
    const service = createResumeImportService({
      picker: () => new Promise((resolve) => (release = resolve)),
      profiles: { save: (p) => p, list: () => [] },
    });
    const services: HelperServices = { resumeImport: service };
    const first = HANDLERS['import.pick_pdf']({}, services);
    expect(await HANDLERS['import.pick_pdf']({}, services)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    release(null);
    expect(await first).toEqual({ ok: true, selection: { status: 'cancelled' } });
  });

  it('暫存校正不寫入 Profile；確認才寫入且標為已確認（R10）', async () => {
    const { call, profiles } = setup([pdf('resume.pdf', makeTextPdf(ENGLISH_RESUME))]);
    await call('import.pick_pdf', {});
    expect(await call('import.save_corrections', { importId: 'id-1', profile: PROFILE })).toEqual({
      ok: true,
    });
    expect(profiles.list()).toEqual([]);
    const confirmed = await call('import.confirm', { importId: 'id-1', profile: PROFILE });
    expect(confirmed).toEqual({ ok: true, profileId: 'id-2' });
    const expected: Profile = { ...PROFILE, id: 'id-2', pdfParseConfirmed: true, version: 1 };
    // D30：另寫出處（依草稿比對，出處另有 confirm-sources.test.ts）
    expect(profiles.list()).toMatchObject([expected]);
  });

  it('寫入的是確認請求帶的內容；同一筆匯入再確認覆寫同一份 Profile', async () => {
    const { call, profiles } = setup([pdf('resume.pdf', makeTextPdf(ENGLISH_RESUME))]);
    await call('import.pick_pdf', {});
    await call('import.save_corrections', { importId: 'id-1', profile: PROFILE });
    const edited: ProfileInput = { ...PROFILE, skills: ['Go'] };
    await call('import.confirm', { importId: 'id-1', profile: edited });
    await call('import.confirm', { importId: 'id-1', profile: { ...edited, skills: ['Rust'] } });
    expect(profiles.list().map((p) => [p.id, p.skills])).toEqual([['id-2', ['Rust']]]);
  });

  it('全空的內容不寫入', async () => {
    const { call, profiles } = setup([pdf('scan.pdf', makeImageOnlyPdf())]);
    await call('import.pick_pdf', {});
    const empty: ProfileInput = { personalInfo: { 姓名: '  ' }, experiences: [], skills: [] };
    expect(await call('import.confirm', { importId: 'id-1', profile: empty })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(profiles.list()).toEqual([]);
  });

  it('未配發的 importId：save／confirm 都回 invalid_request，訊息不回填請求內容', async () => {
    const { call, profiles } = setup([]);
    for (const op of ['import.save_corrections', 'import.confirm'] as const) {
      const response = await call(op, { importId: 'nope-123', profile: PROFILE });
      expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
      expect(JSON.stringify(response)).not.toContain('nope-123');
    }
    expect(profiles.list()).toEqual([]);
  });

  it('記憶體內只留最近幾筆匯入', async () => {
    let n = 0;
    const service = createResumeImportService({
      picker: () => Promise.resolve(pdf('a.pdf', makeImageOnlyPdf())),
      profiles: { save: (p) => p, list: () => [] },
      newId: () => `i${String((n += 1))}`,
      maxImports: 2,
    });
    for (let i = 0; i < 3; i += 1) await service.pickPdf?.();
    expect(service.get?.('i1')).toBeNull();
    expect(service.get?.('i3')).not.toBeNull();
  });

  it('服務沒接上：四個操作都回 not_implemented', async () => {
    for (const op of ['import.pick_pdf', 'import.get'] as const) {
      const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
      expect(await handler({ importId: 'a' }, {})).toMatchObject({
        ok: false,
        error: { code: 'not_implemented' },
      });
    }
    for (const op of ['import.save_corrections', 'import.confirm'] as const) {
      const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
      const response = await handler({ importId: 'a', profile: PROFILE }, { resumeImport: {} });
      expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
    }
  });
});
