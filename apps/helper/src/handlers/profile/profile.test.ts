// profile.get（D28，P1-T079）：唯讀資料區唯一那份已確認的 Profile。資料為合成。
import { BRIDGE_SCHEMAS, type Profile } from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { HANDLERS } from '../registry.ts';
import { createProfileService } from './profile-service.ts';

const PROFILE: Profile = {
  id: 'p-1',
  personalInfo: { 姓名: '範例測' },
  experiences: [],
  skills: ['Go'],
  pdfParseConfirmed: true,
};

function setup() {
  const { db } = openDatabase(':memory:');
  const { profiles } = createRepositories(db);
  const services = { profile: createProfileService(profiles) };
  async function get(): Promise<unknown> {
    const response = await HANDLERS['profile.get']({}, services);
    expect(BRIDGE_SCHEMAS['profile.get'].response.safeParse(response).success).toBe(true);
    return response;
  }
  return { profiles, get };
}

describe('profile.get', () => {
  it('沒有 Profile 回 null', async () => {
    expect(await setup().get()).toEqual({ ok: true, profile: null });
  });

  it('唯一一份已確認的 Profile 原樣回傳', async () => {
    const env = setup();
    env.profiles.save(PROFILE);
    expect(await env.get()).toEqual({ ok: true, profile: PROFILE });
  });

  it('唯一一份但未確認：當成沒有（R10）', async () => {
    const env = setup();
    env.profiles.save({ ...PROFILE, pdfParseConfirmed: false });
    expect(await env.get()).toEqual({ ok: true, profile: null });
  });

  it('多份：回固定原因 multiple_profiles，不挑一份', async () => {
    const env = setup();
    env.profiles.save(PROFILE);
    env.profiles.save({ ...PROFILE, id: 'p-2' });
    const response = await env.get();
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', reason: 'multiple_profiles' },
    });
    expect(JSON.stringify(response)).not.toContain('範例測');
  });

  it('服務沒接上：not_implemented', async () => {
    expect(await HANDLERS['profile.get']({}, {})).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
  });
});
