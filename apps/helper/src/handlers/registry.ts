// 分派表（R7）：contracts 的每個操作對應一個 handler 檔，一次註冊到位（P1-T041）。
// 後續 Task 只改自己群組目錄（handlers/<群組>/）裡的 handler 與 service.ts，不需要改本檔。
// 新增操作要先改 bridge.md 與 contracts，再在這裡加一列（HandlerTable 型別會擋漏列）。
// 每個 handler 外包一層資料區閘門（裁定 #13）：資料區被另一個 helper 占用時，需要儲存的操作回固定錯誤。
import type { BridgeOperation } from '@rolecraft/contracts';

import { resolveServices } from '../services/data-dir.ts';
import { analysisStart } from './analysis/start.ts';
import { analysisProjectSuggestion } from './analysis/project-suggestion.ts';
import { analysisStatus } from './analysis/status.ts';
import { analysisSuggestProjects } from './analysis/suggest-projects.ts';
import { applicationsCreate } from './applications/create.ts';
import { applicationsDelete } from './applications/delete.ts';
import { applicationsList } from './applications/list.ts';
import { applicationsUpdate } from './applications/update.ts';
import { claimsConfirm } from './claims/confirm.ts';
import { claimsCreateProjects } from './claims/create-projects.ts';
import { claimsDeleteProject } from './claims/delete-project.ts';
import { claimsGet } from './claims/get.ts';
import { claimsListProjects } from './claims/list-projects.ts';
import { claimsList } from './claims/list.ts';
import { claimsListUnassigned } from './claims/list-unassigned.ts';
import { claimsMergeProjects } from './claims/merge-projects.ts';
import { claimsMoveClaim } from './claims/move-claim.ts';
import { claimsReject } from './claims/reject.ts';
import { claimsRenameProject } from './claims/rename-project.ts';
import { claimsUpdate } from './claims/update.ts';
import { exportCreate } from './export/create.ts';
import { exportGetVersion } from './export/get-version.ts';
import { exportListVersions } from './export/list-versions.ts';
import { exportReadPdf } from './export/read-pdf.ts';
import { importAiParse } from './import/ai-parse.ts';
import { importAiStatus } from './import/ai-status.ts';
import { importConfirm } from './import/confirm.ts';
import { importGet } from './import/get.ts';
import { importLatestCapture } from './import/latest-capture.ts';
import { importPickPdf } from './import/pick-pdf.ts';
import { importSaveCorrections } from './import/save-corrections.ts';
import { importStartManual } from './import/start-manual.ts';
import { submitResumeCapture } from './import/submit-resume-capture.ts';
import { introGenerate } from './intro/generate.ts';
import { introGet } from './intro/get.ts';
import { introUpdate } from './intro/update.ts';
import { jobsConfirm } from './jobs/confirm.ts';
import { jobsGet } from './jobs/get.ts';
import { jobsList } from './jobs/list.ts';
import { submitJobCapture } from './jobs/submit-job-capture.ts';
import { jobsUpdate } from './jobs/update.ts';
import { messagesGet } from './messages/get.ts';
import { messagesList } from './messages/list.ts';
import { requestDraft } from './messages/request-draft.ts';
import { submitMessageCapture } from './messages/submit-message-capture.ts';
import { messagesUpdateDraft } from './messages/update-draft.ts';
import { photoGet } from './photo/get.ts';
import { photoPick } from './photo/pick.ts';
import { photoRemove } from './photo/remove.ts';
import { profileGet } from './profile/get.ts';
import { profileUpdate } from './profile/update.ts';
import { providersListCandidates } from './providers/list-candidates.ts';
import { providersRecheck } from './providers/recheck.ts';
import { providersReverifyClaude } from './providers/reverify-claude.ts';
import { providersSelectCandidate } from './providers/select-candidate.ts';
import { providersStartLogin } from './providers/start-login.ts';
import { providersStatus } from './providers/status.ts';
import { resumeAcceptSection } from './resume/accept-section.ts';
import { resumeCheckExport } from './resume/check-export.ts';
import { resumeConfirmSection } from './resume/confirm-section.ts';
import { resumeDeleteSection } from './resume/delete-section.ts';
import { resumeEditSection } from './resume/edit-section.ts';
import { resumeGenerate } from './resume/generate.ts';
import { resumeGet } from './resume/get.ts';
import { resumeList } from './resume/list.ts';
import { resumeRejectSection } from './resume/reject-section.ts';
import { sourcesListFolders } from './sources/list-folders.ts';
import { sourcesPickFolders } from './sources/pick-folders.ts';
import { sourcesPreview } from './sources/preview.ts';
import { sourcesRemoveFolder } from './sources/remove-folder.ts';
import { sourcesUpdateAuthorization } from './sources/update-authorization.ts';
import type { HandlerTable, OpHandler } from './handler.ts';

const RAW_HANDLERS: HandlerTable = {
  submit_job_capture: submitJobCapture,
  submit_message_capture: submitMessageCapture,
  submit_resume_capture: submitResumeCapture,
  request_draft: requestDraft,
  'jobs.list': jobsList,
  'jobs.get': jobsGet,
  'jobs.update': jobsUpdate,
  'jobs.confirm': jobsConfirm,
  'import.pick_pdf': importPickPdf,
  'import.get': importGet,
  'import.save_corrections': importSaveCorrections,
  'import.confirm': importConfirm,
  'import.ai_parse': importAiParse,
  'import.ai_status': importAiStatus,
  'import.latest_capture': importLatestCapture,
  'import.start_manual': importStartManual,
  'profile.get': profileGet,
  'profile.update': profileUpdate,
  'photo.pick': photoPick,
  'photo.get': photoGet,
  'photo.remove': photoRemove,
  'sources.pick_folders': sourcesPickFolders,
  'sources.list_folders': sourcesListFolders,
  'sources.preview': sourcesPreview,
  'sources.update_authorization': sourcesUpdateAuthorization,
  'sources.remove_folder': sourcesRemoveFolder,
  'applications.list': applicationsList,
  'applications.create': applicationsCreate,
  'applications.update': applicationsUpdate,
  'applications.delete': applicationsDelete,
  'providers.status': providersStatus,
  'providers.recheck': providersRecheck,
  'providers.list_candidates': providersListCandidates,
  'providers.select_candidate': providersSelectCandidate,
  'providers.start_login': providersStartLogin,
  'providers.reverify_claude': providersReverifyClaude,
  'export.create': exportCreate,
  'export.list_versions': exportListVersions,
  'export.get_version': exportGetVersion,
  'export.read_pdf': exportReadPdf,
  'claims.list_projects': claimsListProjects,
  'claims.list': claimsList,
  'claims.get': claimsGet,
  'claims.confirm': claimsConfirm,
  'claims.update': claimsUpdate,
  'claims.reject': claimsReject,
  'claims.list_unassigned': claimsListUnassigned,
  'claims.create_projects': claimsCreateProjects,
  'claims.rename_project': claimsRenameProject,
  'claims.merge_projects': claimsMergeProjects,
  'claims.move_claim': claimsMoveClaim,
  'claims.delete_project': claimsDeleteProject,
  'resume.generate': resumeGenerate,
  'resume.list': resumeList,
  'resume.get': resumeGet,
  'resume.accept_section': resumeAcceptSection,
  'resume.reject_section': resumeRejectSection,
  'resume.edit_section': resumeEditSection,
  'resume.delete_section': resumeDeleteSection,
  'resume.confirm_section': resumeConfirmSection,
  'resume.check_export': resumeCheckExport,
  'messages.list': messagesList,
  'messages.get': messagesGet,
  'messages.update_draft': messagesUpdateDraft,
  'analysis.start': analysisStart,
  'analysis.status': analysisStatus,
  'analysis.suggest_projects': analysisSuggestProjects,
  'analysis.project_suggestion': analysisProjectSuggestion,
  'intro.generate': introGenerate,
  'intro.get': introGet,
  'intro.update': introUpdate,
};

function gated<Op extends BridgeOperation>(op: Op, handler: OpHandler<Op>): OpHandler<Op> {
  return (payload, services) => {
    const resolved = resolveServices(op, services);
    // BridgeFailure 符合每個操作的回應 schema（失敗分支共用）
    if ('ok' in resolved) return Promise.resolve(resolved as Awaited<ReturnType<OpHandler<Op>>>);
    return handler(payload, resolved);
  };
}

export const HANDLERS = Object.fromEntries(
  (Object.keys(RAW_HANDLERS) as BridgeOperation[]).map((op) => [
    op,
    gated(op, RAW_HANDLERS[op] as OpHandler<typeof op>),
  ]),
) as unknown as HandlerTable;
