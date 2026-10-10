// 匯出測試共用：暫存資料區（真實 SQLite＋檔案儲存區）＋一組通過 R1 的素材。全部虛構，不含真實個資。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  Claim,
  JobSnapshot,
  Profile,
  ResumeSection,
  ResumeVersion,
} from '@rolecraft/contracts';
import type { FontSet } from '@rolecraft/pdf-export';

import { openHelperRuntime, type RuntimeDeps } from '../../../services/runtime.ts';

export const T = '2026-10-10T08:00:00.000Z';
export const CLAIM_ID = 'c0a1b2c3-0000-4000-8000-000000000001';
export const JOB_ID = 'j0a1b2c3-0000-4000-8000-000000000001';
export const VERSION_ID = 'r0a1b2c3-0000-4000-8000-000000000001';

export const EXPERIENCE = {
  company: '星河數位股份有限公司',
  title: '資深後端工程師',
  startDate: '2021/03',
} as const;

export const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p-1',
  personalInfo: {
    姓名: '林小堃',
    電話: '0912-345-678',
    電子郵件: 'xiaokun.lin@example.com',
    生日: '1990/01/01',
  },
  experiences: [{ ...EXPERIENCE, endDate: null, description: '舊描述不印' }],
  skills: ['TypeScript', 'PostgreSQL'],
  pdfParseConfirmed: true,
  ...over,
});

const CLAIM_TEXT = '主導訂單系統拆分為 12 個服務';

export const claim = (over: Partial<Claim> = {}): Claim => ({
  id: CLAIM_ID,
  type: 'feature',
  text: CLAIM_TEXT,
  completionStatus: 'user_confirmed_done',
  basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: CLAIM_TEXT } },
  reviewStatus: 'normal',
  ...over,
});

export const jobSnapshot = (): JobSnapshot => ({
  id: JOB_ID,
  platform: '104',
  url: 'https://www.104.com.tw/job/abc',
  capturedAt: T,
  captureMethod: 'auto',
  fields: {
    company: '虛構科技',
    title: '後端工程師',
    description: '負責後端系統',
    responsibilities: { status: 'not_captured' },
    requirements: { status: 'not_captured' },
    preferredQualifications: { status: 'not_captured' },
    location: { status: 'not_captured' },
  },
  userModified: false,
  confirmedAt: T,
});

const CITATION = { claimId: CLAIM_ID, statedCompletion: 'completed' } as const;

/** 生成段落：引用使用者確認完成的事實項，掛在 Profile 的那段經歷下。 */
export const citedSection = (over: Partial<ResumeSection> = {}): ResumeSection => ({
  id: 's-cited',
  origin: 'generated',
  text: '主導訂單系統拆分為 12 個服務。',
  citations: [CITATION],
  generatedCitations: [CITATION],
  sectionConfirmation: null,
  placement: { group: 'experience', ...EXPERIENCE },
  itemKind: 'bullet',
  ...over,
});

/** 去掉指定的選填欄位（模擬沒有新欄位的舊資料）。 */
export function without(
  section: ResumeSection,
  ...keys: ('placement' | 'itemKind')[]
): ResumeSection {
  const copy = { ...section };
  for (const key of keys) delete copy[key];
  return copy;
}

/** 使用者自己寫、已逐段確認的自我介紹。 */
export const summarySection = (text = '重視可觀測性與文件。'): ResumeSection => ({
  id: 's-summary',
  origin: 'user_written',
  text,
  citations: [],
  sectionConfirmation: { confirmedAt: T, text },
  placement: { group: 'summary' },
});

export const resumeVersion = (sections?: ResumeSection[]): ResumeVersion => ({
  id: VERSION_ID,
  jobSnapshotId: JOB_ID,
  sections: sections ?? [summarySection(), citedSection()],
  createdAt: T,
});

export const FAKE_FONTS: FontSet = { regular: new Uint8Array([1]), bold: new Uint8Array([2]) };

/** 暫存資料區＋已存好的素材；測試結束呼叫 cleanup。 */
export function exportTestbed(deps: RuntimeDeps = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-helper-export-'));
  const runtime = openHelperRuntime(
    { dataDir: dir, fontsDir: path.join(dir, 'fonts') },
    { loadFonts: () => Promise.resolve(FAKE_FONTS), ...deps },
  );
  runtime.repos.profiles.save(profile());
  runtime.repos.claims.save(claim());
  runtime.repos.jobSnapshots.save(jobSnapshot());
  runtime.repos.resumeVersions.save(resumeVersion());
  return {
    dir,
    runtime,
    cleanup: () => {
      runtime.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 假 PDF（內容含標記，方便比對） */
export const fakePdf = (label = 'x', size = 0): Uint8Array => {
  const head = new TextEncoder().encode(`%PDF-1.7 ${label}\n`);
  const out = new Uint8Array(Math.max(size, head.byteLength));
  out.set(head);
  return out;
};
