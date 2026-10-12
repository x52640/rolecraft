// 測試用：在記憶體裡模擬 helper 的 profile.get／profile.update（語意同 helper profile-service；資料全為合成）。
import type {
  BridgeFailure,
  Profile,
  ProfileFieldSource,
  ProfileUpdatePayload,
} from '@rolecraft/contracts';

import type { BridgeTransport } from '../../bridge/transport.ts';

export const src = (text: string, over: Partial<ProfileFieldSource> = {}): ProfileFieldSource => ({
  kind: 'web',
  text,
  truncated: false,
  modified: false,
  ...over,
});

const noSources = { company: null, title: null, startDate: null, endDate: null, description: null };

/** 合成的已確認 Profile：兩段經歷、兩項技能、三列基本資料（含學歷）。 */
export const sampleProfile = (over: Partial<Profile> = {}): Profile => ({
  id: 'profile-1',
  personalInfo: { 姓名: '王小明', Email: 'xiaoming@example.test', 學歷: '某大學 資訊工程學系' },
  experiences: [
    {
      company: '甲公司',
      title: '前端工程師',
      startDate: '2021-03',
      endDate: null,
      description: '維護元件庫',
    },
    {
      company: '乙公司',
      title: '實習生',
      startDate: '2019-07',
      endDate: '2020-06',
      description: '',
    },
  ],
  skills: ['TypeScript', 'React'],
  pdfParseConfirmed: true,
  version: 3,
  sources: {
    personalInfo: { 姓名: src('姓名：王小明'), 學歷: src('某大學 資訊工程學系 2015-2019') },
    experiences: [
      {
        ...noSources,
        company: src('甲公司｜前端工程師｜2021-03 至今'),
        description: src('維護元件庫'.repeat(20), { truncated: true }),
      },
      { ...noSources, title: src('乙公司 實習生', { kind: 'pdf', modified: true }) },
    ],
    skills: [src('技能：TypeScript、React'), null],
  },
  ...over,
});

const fail = (message: string, reason?: string): BridgeFailure =>
  ({
    ok: false,
    error: { code: 'invalid_request', message, ...(reason ? { reason } : {}) },
  }) as BridgeFailure;

/** 照來源列搬移出處，值與基準不同就標「已修改」（同 helper update-apply 的語意，簡化版）。 */
function applyUpdate(base: Profile, p: ProfileUpdatePayload): Profile {
  const s = base.sources;
  const mark = (source: ProfileFieldSource | null | undefined, changed: boolean) =>
    source ? { ...source, modified: source.modified || changed } : null;
  const personalInfo: Record<string, string> = {};
  const infoSources: Record<string, ProfileFieldSource> = {};
  for (const row of p.personalInfo) {
    personalInfo[row.label] = row.value;
    const moved = row.from === null ? null : s?.personalInfo[row.from];
    const old = row.from === null ? undefined : base.personalInfo[row.from];
    const next = mark(moved, old !== row.value);
    if (next) infoSources[row.label] = next;
  }
  const experiences = p.experiences.map((row) => ({
    company: row.company,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
  }));
  const expSources = p.experiences.map((row) => {
    const old = row.from === null ? undefined : base.experiences[row.from];
    const olds = row.from === null ? undefined : s?.experiences[row.from];
    const keys = ['company', 'title', 'startDate', 'endDate', 'description'] as const;
    return Object.fromEntries(
      keys.map((k) => [k, mark(olds?.[k], old?.[k] !== row[k])]),
    ) as NonNullable<Profile['sources']>['experiences'][number];
  });
  const skills = p.skills.map((row) => row.value);
  const skillSources = p.skills.map((row) =>
    row.from === null ? null : mark(s?.skills[row.from], base.skills[row.from] !== row.value),
  );
  return {
    ...base,
    personalInfo,
    experiences,
    skills,
    version: (base.version ?? 0) + 1,
    sources: { personalInfo: infoSources, experiences: expSources, skills: skillSources },
  };
}

export interface FakeProfileBridge {
  transport: BridgeTransport;
  requests: { op: string; payload: unknown }[];
  /** 資料區目前的 Profile；undefined＝多份 */
  profile: Profile | null | undefined;
  /** 下一次 profile.update 改回這個失敗（用一次） */
  failNextUpdate: BridgeFailure | null;
  /** 設了就讓 profile.update 卡住，直到呼叫 release */
  hold: { release: () => void } | null;
  holdUpdate: () => void;
}

/** initial：Profile、null（沒有）或 'multiple'（多份）。 */
export function fakeProfileBridge(initial: Profile | null | 'multiple' = sampleProfile()) {
  const fake: FakeProfileBridge = {
    requests: [],
    profile: initial === 'multiple' ? undefined : initial,
    failNextUpdate: null,
    hold: null,
    holdUpdate: () => undefined,
    transport: { send: () => Promise.resolve(null) },
  };
  let gate: Promise<void> | null = null;
  fake.holdUpdate = () => {
    let release = () => undefined as void;
    gate = new Promise<void>((resolve) => (release = resolve));
    fake.hold = { release: () => release() };
  };
  const send = async (raw: unknown): Promise<unknown> => {
    const request = raw as { op: string; payload: unknown };
    fake.requests.push(structuredClone(request));
    if (fake.profile === undefined) return fail('多份', 'multiple_profiles');
    if (request.op === 'profile.get') return { ok: true, profile: fake.profile };
    if (request.op !== 'profile.update') return fail('未支援');
    if (gate) await gate;
    if (fake.failNextUpdate) {
      const failure = fake.failNextUpdate;
      fake.failNextUpdate = null;
      return failure;
    }
    const payload = request.payload as ProfileUpdatePayload;
    if (!fake.profile) return fail('沒有', 'profile_missing');
    if (payload.baseVersion !== (fake.profile.version ?? 0)) {
      return fail('個人資料已在別處更新，這次修改沒有存', 'profile_conflict');
    }
    fake.profile = applyUpdate(fake.profile, payload);
    return { ok: true, profile: fake.profile };
  };
  fake.transport = { send };
  return fake;
}
