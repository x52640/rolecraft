// 測試用：每個編輯器操作（P1-T041）一則合法請求（與 contracts 的同名 fixture 同內容；跨套件不得相對 import）。
const ID = '0f8fa5c4-3b1e-4c56-9d1a-7a2b9c3d4e5f';
const ID2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const T = '2026-10-10T08:00:00.000Z';

const fields = {
  company: '某公司',
  title: '前端工程師',
  description: '負責網站開發',
  responsibilities: { status: 'not_captured' },
  requirements: { status: 'not_provided' },
  preferredQualifications: { status: 'not_captured' },
  location: { status: 'captured', value: '台北' },
};

const profile = {
  personalInfo: { 姓名: '王小明' },
  experiences: [
    { company: '某公司', title: '工程師', startDate: '2020-01', endDate: null, description: '' },
  ],
  skills: ['TypeScript'],
};

const application = {
  initiation: 'proactive',
  appliedAt: T,
  status: '已投遞',
  exportVersionId: ID,
};

export const editorRequests = {
  'jobs.list': { op: 'jobs.list', payload: {} },
  'jobs.get': { op: 'jobs.get', payload: { jobSnapshotId: ID } },
  'jobs.update': { op: 'jobs.update', payload: { jobSnapshotId: ID, fields } },
  'jobs.confirm': { op: 'jobs.confirm', payload: { jobSnapshotId: ID } },
  'import.pick_pdf': { op: 'import.pick_pdf', payload: {} },
  'import.get': { op: 'import.get', payload: { importId: ID } },
  'import.save_corrections': { op: 'import.save_corrections', payload: { importId: ID, profile } },
  'import.confirm': { op: 'import.confirm', payload: { importId: ID, profile } },
  'sources.pick_folders': { op: 'sources.pick_folders', payload: {} },
  'sources.list_folders': { op: 'sources.list_folders', payload: {} },
  'sources.preview': { op: 'sources.preview', payload: { rootId: ID } },
  'sources.update_authorization': {
    op: 'sources.update_authorization',
    payload: { rootId: ID, authorize: [ID2], revoke: [] },
  },
  'sources.remove_folder': { op: 'sources.remove_folder', payload: { rootId: ID } },
  'applications.list': { op: 'applications.list', payload: {} },
  'applications.create': { op: 'applications.create', payload: application },
  'applications.update': {
    op: 'applications.update',
    payload: { applicationId: ID2, ...application },
  },
  'applications.delete': { op: 'applications.delete', payload: { applicationId: ID } },
  'providers.status': { op: 'providers.status', payload: {} },
  'providers.recheck': { op: 'providers.recheck', payload: { service: 'claude' } },
  'providers.list_candidates': { op: 'providers.list_candidates', payload: { service: 'claude' } },
  'providers.select_candidate': {
    op: 'providers.select_candidate',
    payload: { service: 'claude', candidateId: ID },
  },
  'providers.start_login': { op: 'providers.start_login', payload: { service: 'codex' } },
  'export.create': { op: 'export.create', payload: { resumeVersionId: ID } },
  'export.list_versions': { op: 'export.list_versions', payload: {} },
  'export.get_version': { op: 'export.get_version', payload: { exportVersionId: ID } },
  'export.read_pdf': { op: 'export.read_pdf', payload: { exportVersionId: ID, chunkIndex: 0 } },
  'claims.list_projects': { op: 'claims.list_projects', payload: {} },
  'claims.list': { op: 'claims.list', payload: { projectId: ID } },
  'claims.get': { op: 'claims.get', payload: { claimId: ID } },
  'claims.confirm': {
    op: 'claims.confirm',
    payload: {
      claimId: ID,
      text: '完成登入功能',
      completion: 'user_confirmed_done',
      expectedReviewStatus: 'normal',
    },
  },
  'claims.update': { op: 'claims.update', payload: { claimId: ID, text: '完成登入功能' } },
  'claims.reject': { op: 'claims.reject', payload: { claimId: ID } },
  'claims.list_unassigned': { op: 'claims.list_unassigned', payload: {} },
  'resume.generate': { op: 'resume.generate', payload: { jobSnapshotId: ID } },
  'resume.list': { op: 'resume.list', payload: { jobSnapshotId: ID } },
  'resume.get': { op: 'resume.get', payload: { resumeVersionId: ID } },
  'resume.accept_section': {
    op: 'resume.accept_section',
    payload: { resumeVersionId: ID, sectionId: ID2 },
  },
  'resume.reject_section': {
    op: 'resume.reject_section',
    payload: { resumeVersionId: ID, sectionId: ID2 },
  },
  'resume.edit_section': {
    op: 'resume.edit_section',
    payload: {
      resumeVersionId: ID,
      sectionId: ID2,
      text: '負責登入功能',
      citations: [{ claimId: ID, statedCompletion: 'completed' }],
    },
  },
  'resume.delete_section': {
    op: 'resume.delete_section',
    payload: { resumeVersionId: ID, sectionId: ID2 },
  },
  'resume.confirm_section': {
    op: 'resume.confirm_section',
    payload: { resumeVersionId: ID, sectionId: ID2, text: '本段屬實' },
  },
  'resume.check_export': { op: 'resume.check_export', payload: { resumeVersionId: ID } },
  'messages.list': { op: 'messages.list', payload: {} },
  'messages.get': { op: 'messages.get', payload: { messageDraftId: ID } },
  'messages.update_draft': {
    op: 'messages.update_draft',
    payload: { messageDraftId: ID, draft: '謝謝您的邀約' },
  },
  'analysis.start': { op: 'analysis.start', payload: {} },
  'analysis.status': { op: 'analysis.status', payload: {} },
} as const;
