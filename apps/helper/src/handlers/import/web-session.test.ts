// 網頁擷取與手動輸入的匯入工作階段（P1-T079；resume-import「匯入工作階段」）。
// 假 provider（fakeEngine），不呼叫真實 CLI；資料全為合成、去識別化。
import {
  BRIDGE_SCHEMAS,
  RESUME_CAPTURE_MAX_BLOCKS,
  RESUME_CAPTURE_MAX_TEXT_BYTES,
  SubmitResumeCaptureRequest,
  type BridgeOperation,
  type ProfileInput,
} from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { fakeEngine } from '../analysis/__fixtures__/analysis-env.ts';
import { HANDLERS } from '../registry.ts';
import type { HelperServices } from '../services.ts';
import { createResumeImportService } from './import-service.ts';
import type { ResumeCapturePayload } from './service.ts';

const SECRET_URL = 'https://pda.104.com.tw/profile/secret-path';

const capture = (over: Partial<ResumeCapturePayload> = {}): ResumeCapturePayload => ({
  platform: '104',
  url: SECRET_URL,
  capturedAt: '2026-10-12T08:00:00.000Z',
  truncated: false,
  nameText: '範例測',
  blocks: [
    { kind: 'heading', level: 2, label: null, text: '工作經歷', continues: false },
    { kind: 'label_value', level: null, label: '職務類別', text: '後端工程師', continues: false },
    { kind: 'paragraph', level: null, label: null, text: '負責付款 API', continues: false },
  ],
  ...over,
});

const PROFILE: ProfileInput = {
  personalInfo: { 姓名: '範例測' },
  experiences: [
    { company: '虛構公司', title: '工程師', startDate: '2020/01', endDate: null, description: '' },
  ],
  skills: ['Go'],
};

function setup(maxImports = 20) {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  const fake = fakeEngine(() => ({ text: '{}' }));
  let selects = 0;
  let n = 0;
  const service = createResumeImportService({
    profiles: repos.profiles,
    newId: () => `id-${String((n += 1))}`,
    maxImports,
    ai: {
      engine: { ...fake.engine, select: () => ((selects += 1), fake.engine.select()) },
      recordRunCheck: () => undefined,
    },
  });
  const services: HelperServices = { resumeImport: service };
  async function call(op: BridgeOperation, payload: unknown = {}): Promise<unknown> {
    const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
    const response = await handler(payload, services);
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success, op).toBe(true);
    return response;
  }
  return { call, repos, fake, service, modelCalls: () => selects + fake.prompts.length };
}

describe('submit_resume_capture／import.latest_capture（D28）', () => {
  it('建立網頁來源工作階段、依序配發 b1…、不呼叫模型；網址與 nameText 不回給編輯器', async () => {
    const env = setup();
    expect(await env.call('import.latest_capture')).toEqual({ ok: true, capture: null });
    expect(await env.call('submit_resume_capture', capture())).toEqual({ ok: true });
    expect(await env.call('import.latest_capture')).toEqual({
      ok: true,
      capture: {
        importId: 'id-1',
        platform: '104',
        capturedAt: '2026-10-12T08:00:00.000Z',
        truncated: false,
      },
    });
    const got = (await env.call('import.get', { importId: 'id-1' })) as {
      result: { status: string; displayName: string; blocks: { id: string; text: string }[] };
    };
    expect(got.result.status).toBe('web_capture');
    expect(got.result.displayName).toBe('網頁：104');
    expect(got.result.blocks.map((b) => [b.id, b.text])).toEqual([
      ['b1', '工作經歷'],
      ['b2', '後端工程師'],
      ['b3', '負責付款 API'],
    ]);
    expect(JSON.stringify(got)).not.toContain('secret-path');
    expect(JSON.stringify(got)).not.toContain('範例測');
    expect(env.modelCalls()).toBe(0);
  });

  it('截斷標示原樣帶出；後來的擷取取代 latest，手動與 PDF 不影響 latest', async () => {
    const env = setup();
    await env.call('submit_resume_capture', capture());
    await env.call('submit_resume_capture', capture({ platform: 'cake', truncated: true }));
    await env.call('import.start_manual');
    expect(await env.call('import.latest_capture')).toMatchObject({
      capture: { importId: 'id-2', platform: 'cake', truncated: true },
    });
    expect(await env.call('import.get', { importId: 'id-2' })).toMatchObject({
      result: { displayName: '網頁：Cake', truncated: true },
    });
  });

  it('與其他來源共用 20 筆：第 21 筆擠掉最舊的擷取後 latest 為 null、get 找不到', async () => {
    const env = setup();
    await env.call('submit_resume_capture', capture());
    for (let i = 0; i < 19; i += 1) await env.call('import.start_manual');
    expect(await env.call('import.latest_capture')).toMatchObject({
      capture: { importId: 'id-1' },
    });
    await env.call('import.start_manual'); // 第 21 筆
    expect(await env.call('import.latest_capture')).toEqual({ ok: true, capture: null });
    expect(await env.call('import.get', { importId: 'id-1' })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
  });

  it('連續 21 次擷取：latest 是最新那筆，最舊的被擠掉', async () => {
    const env = setup();
    for (let i = 0; i < 21; i += 1) await env.call('submit_resume_capture', capture());
    expect(await env.call('import.latest_capture')).toMatchObject({
      capture: { importId: 'id-21' },
    });
    expect(await env.call('import.get', { importId: 'id-1' })).toMatchObject({ ok: false });
    expect(await env.call('import.get', { importId: 'id-2' })).toMatchObject({ ok: true });
    expect(env.modelCalls()).toBe(0);
  });

  it('上限內最大的擷取：import.get 回應序列化後低於 1 MiB', async () => {
    const env = setup();
    // 最壞情況：每個字都要 JSON 跳脫（"），標籤與文字合計剛好在上限內，區塊數取上限
    const perBlock = Math.floor(RESUME_CAPTURE_MAX_TEXT_BYTES / RESUME_CAPTURE_MAX_BLOCKS);
    const label = '"'.repeat(30);
    const block = {
      kind: 'label_value' as const,
      level: null,
      label,
      text: '"'.repeat(perBlock - label.length),
      continues: false,
    };
    const big = capture({
      capturedAt: '2026-10-12T08:00:00.123456789+08:00',
      truncated: true,
      blocks: Array.from({ length: RESUME_CAPTURE_MAX_BLOCKS }, () => block),
    });
    const request = { op: 'submit_resume_capture', payload: big };
    expect(SubmitResumeCaptureRequest.safeParse(request).success).toBe(true);
    await env.call('submit_resume_capture', big);
    const response = await env.call('import.get', { importId: 'id-1' });
    const bytes = new TextEncoder().encode(JSON.stringify(response)).length;
    expect(bytes).toBeGreaterThan(RESUME_CAPTURE_MAX_TEXT_BYTES * 2 - 1000);
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});

describe('import.start_manual／import.confirm 更新唯一 Profile（Q8）', () => {
  it('沒有任何擷取或 PDF 時也能建立手動工作階段並確認', async () => {
    const env = setup();
    expect(await env.call('import.start_manual')).toEqual({ ok: true, importId: 'id-1' });
    expect(await env.call('import.get', { importId: 'id-1' })).toEqual({
      ok: true,
      result: { status: 'manual', displayName: '手動輸入' },
    });
    expect(await env.call('import.confirm', { importId: 'id-1', profile: PROFILE })).toEqual({
      ok: true,
      profileId: 'id-2',
    });
    // D30：版本號加一；手動輸入沒有草稿，全部沒有出處
    expect(env.repos.profiles.list()).toEqual([
      {
        ...PROFILE,
        id: 'id-2',
        pdfParseConfirmed: true,
        version: 1,
        sources: {
          personalInfo: {},
          experiences: PROFILE.experiences.map(() => ({
            company: null,
            title: null,
            startDate: null,
            endDate: null,
            description: null,
          })),
          skills: PROFILE.skills.map(() => null),
        },
      },
    ]);
  });

  it('再次匯入並確認：仍只有一份 Profile、id 不變、內容換成新的', async () => {
    const env = setup();
    await env.call('submit_resume_capture', capture());
    await env.call('import.confirm', { importId: 'id-1', profile: PROFILE });
    await env.call('submit_resume_capture', capture());
    const again = await env.call('import.confirm', {
      importId: 'id-3',
      profile: { ...PROFILE, skills: ['Rust'] },
    });
    expect(again).toEqual({ ok: true, profileId: 'id-2' });
    await env.call('import.start_manual');
    await env.call('import.confirm', { importId: 'id-4', profile: { ...PROFILE, skills: ['C'] } });
    expect(env.repos.profiles.list().map((p) => [p.id, p.skills])).toEqual([['id-2', ['C']]]);
  });

  it('資料區已有一份（舊資料、其他 id）：更新那一份', async () => {
    const env = setup();
    env.repos.profiles.save({ ...PROFILE, id: 'old-1', pdfParseConfirmed: false });
    await env.call('import.start_manual');
    expect(await env.call('import.confirm', { importId: 'id-1', profile: PROFILE })).toEqual({
      ok: true,
      profileId: 'old-1',
    });
    // 舊資料沒有版本號視為 0，確認後為 1（D30）
    expect(env.repos.profiles.list()).toMatchObject([
      { ...PROFILE, id: 'old-1', pdfParseConfirmed: true, version: 1 },
    ]);
  });

  it('已有多份：不寫入，回固定原因 multiple_profiles', async () => {
    const env = setup();
    env.repos.profiles.save({ ...PROFILE, id: 'old-1', pdfParseConfirmed: true });
    env.repos.profiles.save({ ...PROFILE, id: 'old-2', pdfParseConfirmed: true });
    const before = env.repos.profiles.list();
    await env.call('import.start_manual');
    const response = await env.call('import.confirm', {
      importId: 'id-1',
      profile: { ...PROFILE, skills: ['Rust'] },
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', reason: 'multiple_profiles' },
    });
    expect(env.repos.profiles.list()).toEqual(before);
  });
});
