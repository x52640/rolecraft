// profile.update（D30，P1-T090；resume-import「個人資料編輯（D30）」、bridge.md profile.update）。
// 驗：修改、刪除、新增後讀回一致且仍已確認；版本不符回 profile_conflict 且資料完全不變；import.confirm 之後用舊版本號衝突；
// 來源列不存在或重複引用回 invalid_request；出處搬移並標「已修改」、新增列沒有出處；請求不能帶出處文字；
// 舊資料（沒有版本號、出處）可更新；沒有 Profile／多份／內容全空不寫入。資料全為合成、去識別化。
import {
  BRIDGE_SCHEMAS,
  type Profile,
  type ProfileFieldSource,
  type ProfileUpdatePayload,
} from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { createResumeImportService } from '../import/import-service.ts';
import { HANDLERS } from '../registry.ts';
import type { HelperServices } from '../services.ts';
import { createProfileService } from './profile-service.ts';

const src = (text: string, modified = false): ProfileFieldSource => ({
  kind: 'web',
  text,
  truncated: false,
  modified,
});

const EXPERIENCE = {
  company: '虛構雲端',
  title: '後端工程師',
  startDate: '2020/01',
  endDate: null,
  description: '負責付款 API',
};

const BASE: Profile = {
  id: 'p-1',
  personalInfo: { 姓名: '范例安', 學歷: '虛構大學' },
  experiences: [EXPERIENCE, { ...EXPERIENCE, company: '虛構商店', startDate: '2018/01' }],
  skills: ['Go', 'SQL'],
  pdfParseConfirmed: true,
  version: 3,
  sources: {
    personalInfo: { 姓名: src('姓名：范例安'), 學歷: src('虛構大學 資工系') },
    experiences: [
      {
        company: src('虛構雲端'),
        title: src('後端工程師'),
        startDate: src('2020/01 ~ 至今'),
        endDate: null,
        description: src('負責付款 API'),
      },
      { company: null, title: null, startDate: null, endDate: null, description: null },
    ],
    skills: [src('Go、SQL'), null],
  },
};

/** 基準原樣送回（每列都標來源列）。 */
function unchanged(base: Profile): ProfileUpdatePayload {
  return {
    baseVersion: base.version ?? 0,
    personalInfo: Object.entries(base.personalInfo).map(([label, value]) => ({
      label,
      value,
      from: label,
    })),
    experiences: base.experiences.map((e, i) => ({ ...e, from: i })),
    skills: base.skills.map((value, i) => ({ value, from: i })),
  };
}

function setup(...stored: Profile[]) {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  for (const profile of stored) repos.profiles.save(profile);
  const services: HelperServices = {
    profile: createProfileService(repos.profiles),
    resumeImport: createResumeImportService({ profiles: repos.profiles, newId: () => 'imp-1' }),
  };
  async function call(
    op: 'profile.update' | 'profile.get' | 'import.confirm' | 'import.start_manual',
    payload: unknown,
  ) {
    // 走 contracts schema（與 dispatch 相同）：請求不合法直接回 null
    const request = BRIDGE_SCHEMAS[op].request.safeParse({ op, payload });
    if (!request.success) return null;
    const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
    const response = await handler(request.data.payload, services);
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    return response as Record<string, unknown>;
  }
  return { repos, call, update: (payload: unknown) => call('profile.update', payload) };
}

const reasonOf = (response: Record<string, unknown> | null) =>
  (response as { error?: { reason?: string } } | null)?.error?.reason;

describe('profile.update（D30）', () => {
  it('修改、刪除、新增後讀回一致、仍已確認、版本號加一；出處搬移並標已修改、新增列沒有出處', async () => {
    const env = setup(BASE);
    const payload: ProfileUpdatePayload = {
      baseVersion: 3,
      personalInfo: [
        { label: '姓名', value: '范例安', from: '姓名' },
        { label: '最高學歷', value: '虛構大學 碩士', from: '學歷' },
        { label: '網站', value: 'example.test', from: null },
      ],
      experiences: [
        { ...EXPERIENCE, title: '資深後端工程師', from: 0 },
        { ...EXPERIENCE, company: '新公司', from: null },
      ],
      skills: [
        { value: 'SQL', from: 1 },
        { value: 'Golang', from: 0 },
        { value: 'Rust', from: null },
      ],
    };
    const response = await env.update(payload);
    const expected: Profile = {
      id: 'p-1',
      personalInfo: { 姓名: '范例安', 最高學歷: '虛構大學 碩士', 網站: 'example.test' },
      experiences: [
        { ...EXPERIENCE, title: '資深後端工程師' },
        { ...EXPERIENCE, company: '新公司' },
      ],
      skills: ['SQL', 'Golang', 'Rust'],
      pdfParseConfirmed: true,
      version: 4,
      sources: {
        personalInfo: { 姓名: src('姓名：范例安'), 最高學歷: src('虛構大學 資工系', true) },
        experiences: [
          {
            company: src('虛構雲端'),
            title: src('後端工程師', true),
            startDate: src('2020/01 ~ 至今'),
            endDate: null,
            description: src('負責付款 API'),
          },
          { company: null, title: null, startDate: null, endDate: null, description: null },
        ],
        skills: [null, src('Go、SQL', true), null],
      },
    };
    expect(response).toEqual({ ok: true, profile: expected });
    expect(await env.call('profile.get', {})).toEqual({ ok: true, profile: expected });
  });

  it('已修改的標示一旦標上就保留（改回原值也一樣）', async () => {
    const env = setup(BASE);
    const edit = unchanged(BASE);
    edit.skills = [
      { value: 'Golang', from: 0 },
      { value: 'SQL', from: 1 },
    ];
    await env.update(edit);
    const back = unchanged(env.repos.profiles.list()[0] as Profile);
    await env.update(back);
    expect(env.repos.profiles.list()[0]?.sources?.skills[0]).toEqual(src('Go、SQL', true));
    expect(env.repos.profiles.list()[0]?.version).toBe(5);
  });

  it('版本號不符：回 profile_conflict，資料完全不變', async () => {
    const env = setup(BASE);
    const before = JSON.stringify(env.repos.profiles.list());
    for (const baseVersion of [2, 4, 0]) {
      const response = await env.update({ ...unchanged(BASE), baseVersion, skills: [] });
      expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
      expect(reasonOf(response)).toBe('profile_conflict');
    }
    expect(JSON.stringify(env.repos.profiles.list())).toBe(before);
  });

  it('個人資料頁開著時另一處確認匯入：之後用舊版本號儲存會衝突', async () => {
    const env = setup(BASE);
    const opened = unchanged(BASE); // 畫面讀到版本 3
    await env.call('import.start_manual', {});
    const confirmed = await env.call('import.confirm', {
      importId: 'imp-1',
      profile: { personalInfo: { 姓名: '范例安' }, experiences: [], skills: ['C'] },
    });
    expect(confirmed).toEqual({ ok: true, profileId: 'p-1' });
    expect(env.repos.profiles.list()[0]?.version).toBe(4);
    const after = JSON.stringify(env.repos.profiles.list());
    expect(reasonOf(await env.update(opened))).toBe('profile_conflict');
    expect(JSON.stringify(env.repos.profiles.list())).toBe(after);
  });

  it.each([
    ['基本資料來源列不存在', (p: ProfileUpdatePayload) => (p.personalInfo[0]!.from = '電話')],
    [
      '原型上的名稱不算來源列',
      (p: ProfileUpdatePayload) => (p.personalInfo[0]!.from = 'constructor'),
    ],
    ['基本資料同一列引用兩次', (p: ProfileUpdatePayload) => (p.personalInfo[1]!.from = '姓名')],
    ['經歷來源位置超出', (p: ProfileUpdatePayload) => (p.experiences[1]!.from = 2)],
    ['經歷同一列引用兩次', (p: ProfileUpdatePayload) => (p.experiences[1]!.from = 0)],
    ['技能來源位置超出', (p: ProfileUpdatePayload) => (p.skills[0]!.from = 9)],
    ['技能同一列引用兩次', (p: ProfileUpdatePayload) => (p.skills[1]!.from = 0)],
  ])('%s：invalid_request、不寫入', async (_name, mutate) => {
    const env = setup(BASE);
    const before = JSON.stringify(env.repos.profiles.list());
    const payload = unchanged(BASE);
    mutate(payload);
    const response = await env.update(payload);
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(reasonOf(response)).toBeUndefined();
    expect(JSON.stringify(env.repos.profiles.list())).toBe(before);
  });

  it('請求不能帶出處文字、確認旗標、版本號以外的欄位；欄位名重複、公司空白被 schema 擋', async () => {
    const env = setup(BASE);
    const before = JSON.stringify(env.repos.profiles.list());
    const payload = unchanged(BASE);
    const bad: unknown[] = [
      { ...payload, sources: BASE.sources },
      { ...payload, pdfParseConfirmed: true },
      { ...payload, personalInfo: [{ ...payload.personalInfo[0], source: '偽造的出處' }] },
      { ...payload, skills: [{ value: 'Go', from: 0, source: src('偽造') }] },
      {
        ...payload,
        personalInfo: [...payload.personalInfo, { label: '姓名', value: 'x', from: null }],
      },
      { ...payload, experiences: [{ ...payload.experiences[0], company: '  ' }] },
      { ...payload, baseVersion: -1 },
    ];
    for (const request of bad) expect(await env.update(request)).toBeNull();
    expect(JSON.stringify(env.repos.profiles.list())).toBe(before);
  });

  it('舊資料（沒有版本號與出處）：基準版本號 0 可更新，之後版本 1、出處都是空的', async () => {
    const legacy: Profile = { ...BASE, version: undefined, sources: undefined };
    delete legacy.version;
    delete legacy.sources;
    const env = setup(legacy);
    expect(await env.call('profile.get', {})).toEqual({ ok: true, profile: legacy });
    expect(reasonOf(await env.update({ ...unchanged(legacy), baseVersion: 1 }))).toBe(
      'profile_conflict',
    );
    const response = await env.update(unchanged(legacy));
    expect(response).toMatchObject({ ok: true, profile: { version: 1 } });
    expect(env.repos.profiles.list()[0]?.sources).toEqual({
      personalInfo: {},
      experiences: legacy.experiences.map(() => ({
        company: null,
        title: null,
        startDate: null,
        endDate: null,
        description: null,
      })),
      skills: [null, null],
    });
  });

  it('沒有 Profile（或只有未確認的）回 profile_missing；多份回 multiple_profiles；都不寫入', async () => {
    expect(reasonOf(await setup().update(unchanged(BASE)))).toBe('profile_missing');
    const unconfirmed = setup({ ...BASE, pdfParseConfirmed: false });
    expect(reasonOf(await unconfirmed.update(unchanged(BASE)))).toBe('profile_missing');
    expect(unconfirmed.repos.profiles.list()[0]?.pdfParseConfirmed).toBe(false);
    const many = setup(BASE, { ...BASE, id: 'p-2' });
    const before = JSON.stringify(many.repos.profiles.list());
    expect(reasonOf(await many.update(unchanged(BASE)))).toBe('multiple_profiles');
    expect(JSON.stringify(many.repos.profiles.list())).toBe(before);
  });

  it('內容全空：invalid_request、不寫入（驗證同 import.confirm）', async () => {
    const env = setup(BASE);
    const response = await env.update({
      baseVersion: 3,
      personalInfo: [{ label: '姓名', value: '  ', from: '姓名' }],
      experiences: [],
      skills: [],
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(env.repos.profiles.list()[0]?.version).toBe(3);
  });
});
