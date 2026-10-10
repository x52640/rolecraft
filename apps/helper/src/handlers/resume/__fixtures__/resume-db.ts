// resume 測試共用：真實 SQLite（記憶體），預先放已確認的 Profile、職缺快照、四個事實項與一個履歷版本。
import type {
  BridgeRequest,
  Claim,
  JobSnapshot,
  Profile,
  ResumeSection,
  ResumeVersion,
} from '@rolecraft/contracts';
import { createRepositories, openDatabase, type Repositories } from '@rolecraft/storage';

import { recordingLogger } from '../../../__fixtures__/requests.ts';
import { dispatch } from '../../../bridge/dispatch.ts';
import type { HelperServices } from '../../services.ts';
import { createResumeService, type ResumeServiceOptions } from '../storage-service.ts';

export const T = '2026-10-10T08:00:00.000Z';
export const CONFIRMED_AT = '2026-10-11T09:30:00.000Z';
export const JOB = 'job-1';
export const V = 'version-1';
export const INVALID = { ok: false, error: { code: 'invalid_request' } };

const excerpt = (text: string) => ({
  sourceDocumentId: 'doc-1',
  contentVersion: 1,
  contentHash: 'a'.repeat(64),
  location: 'tb2:0:1/1:x',
  text,
});

/** C1 使用者確認完成、C2 文件標示完成、C3 成果數字、（不可用）待複核。 */
export const CLAIMS: Claim[] = [
  {
    id: 'c-done',
    type: 'feature',
    text: '匯出 PDF',
    completionStatus: 'user_confirmed_done',
    basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '匯出 PDF' } },
    reviewStatus: 'normal',
  },
  {
    id: 'c-doc',
    type: 'feature',
    text: '登入功能',
    completionStatus: 'documented_done',
    basis: { sourceExcerpts: [excerpt('- [x] 登入功能')], userConfirmation: null },
    reviewStatus: 'normal',
  },
  {
    id: 'c-metric',
    type: 'outcome_metric',
    text: '載入時間縮短 40%',
    basis: { sourceExcerpts: [excerpt('載入時間縮短 40%')], userConfirmation: null },
    reviewStatus: 'normal',
  },
  {
    id: 'c-review',
    type: 'feature',
    text: '金流串接',
    completionStatus: 'documented_done',
    basis: { sourceExcerpts: [excerpt('金流串接完成')], userConfirmation: null },
    reviewStatus: 'needs_review',
  },
];

export const PROFILE: Profile = {
  id: 'profile-1',
  personalInfo: { 姓名: '王小明' },
  experiences: [
    {
      company: '甲公司',
      title: '前端工程師',
      startDate: '2021-03',
      endDate: null,
      description: '負責網站前端開發。',
    },
  ],
  skills: ['TypeScript'],
  pdfParseConfirmed: true,
};

export function snapshot(over: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: JOB,
    platform: '104',
    url: null,
    capturedAt: T,
    captureMethod: 'manual_paste',
    fields: {
      company: '乙公司',
      title: '資深前端工程師',
      description: '需要前端開發經驗',
      responsibilities: { status: 'not_captured' },
      requirements: { status: 'captured', value: '熟悉 TypeScript' },
      preferredQualifications: { status: 'not_provided' },
      location: { status: 'not_captured' },
    },
    userModified: false,
    confirmedAt: T,
    ...over,
  };
}

export const EXPERIENCE = {
  group: 'experience',
  company: '甲公司',
  title: '前端工程師',
  startDate: '2021-03',
} as const;

export function generated(
  id: string,
  text: string,
  citations: ResumeSection['citations'],
  over: Partial<ResumeSection> = {},
): ResumeSection {
  return {
    id,
    origin: 'generated',
    text,
    citations,
    generatedCitations: citations,
    sectionConfirmation: null,
    placement: EXPERIENCE,
    rationale: '對應職缺需求',
    decision: 'pending',
    ...over,
  };
}

/** s-exp：經歷、文件標示完成寫成進行中；s-sum：確認完成寫成已完成；s-bad：把文件標示完成寫成已完成＋無出處數字。 */
export function version(sections?: ResumeSection[]): ResumeVersion {
  return {
    id: V,
    jobSnapshotId: JOB,
    createdAt: T,
    sections: sections ?? [
      generated('s-exp', '開發登入功能', [{ claimId: 'c-doc', statedCompletion: 'in_progress' }]),
      generated('s-sum', '負責匯出 PDF', [{ claimId: 'c-done', statedCompletion: 'completed' }], {
        placement: { group: 'summary' },
      }),
      generated(
        's-bad',
        '登入功能已上線，效能提升 50%',
        [{ claimId: 'c-doc', statedCompletion: 'completed' }],
        { placement: { group: 'project' } },
      ),
    ],
  };
}

export interface ResumeDb {
  db: ReturnType<typeof openDatabase>['db'];
  repos: Repositories;
  services: HelperServices;
  send(request: BridgeRequest | Record<string, unknown>): Promise<unknown>;
  section(id: string): ResumeSection | undefined;
  cleanup(): void;
}

export function openResumeDb(
  options: Omit<ResumeServiceOptions, 'db'> & { withVersion?: boolean } = {},
): ResumeDb {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  repos.profiles.save(PROFILE);
  repos.jobSnapshots.save(snapshot());
  for (const claim of CLAIMS) repos.claims.save(claim);
  if (options.withVersion !== false) repos.resumeVersions.save(version());
  const serviceOptions = { ...options };
  delete serviceOptions.withVersion;
  const services: HelperServices = {
    resume: createResumeService({ db, now: () => CONFIRMED_AT, ...serviceOptions }),
  };
  return {
    db,
    repos,
    services,
    send: async (request) => (await dispatch(request, services, recordingLogger())).response,
    section: (id) => repos.resumeVersions.get(V)?.sections.find((s) => s.id === id),
    cleanup: () => db.close(),
  };
}
