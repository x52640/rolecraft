// 專案建立與整理（P1-T063，D23；evidence-model「專案分組與事實項歸屬」）。
// 每個動作都是一個交易：先驗證，全部合格才寫入，不半套建立或搬動。
import type { DatabaseSync } from 'node:sqlite';

import type { BridgeOperation, BridgeRequestOf, ProjectEvidence } from '@rolecraft/contracts';
import { projectForClaim } from '@rolecraft/pipeline';
import {
  createRepositories,
  newId as storageId,
  transaction,
  type Repositories,
} from '@rolecraft/storage';

import type { ClaimsWriteResult } from './service.ts';

type Payload<Op extends BridgeOperation> = BridgeRequestOf<Op>['payload'];

const OK: ClaimsWriteResult = { ok: true };
const NOT_FOUND: ClaimsWriteResult = { ok: false, reason: 'not_found' };
const INVALID: ClaimsWriteResult = { ok: false, reason: 'invalid_projects' };
const SAME: ClaimsWriteResult = { ok: false, reason: 'same_project' };

export interface ProjectOps {
  createProjects(payload: Payload<'claims.create_projects'>): Promise<ClaimsWriteResult>;
  renameProject(payload: Payload<'claims.rename_project'>): Promise<ClaimsWriteResult>;
  mergeProjects(payload: Payload<'claims.merge_projects'>): Promise<ClaimsWriteResult>;
  moveClaim(payload: Payload<'claims.move_claim'>): Promise<ClaimsWriteResult>;
  deleteProject(projectId: string): Promise<ClaimsWriteResult>;
}

/** 文件都存在、目前已授權、尚未屬於任何專案，且整個請求內不重複。 */
function documentsUsable(
  repos: Repositories,
  groups: Payload<'claims.create_projects'>['projects'],
) {
  const seen = new Set<string>();
  for (const id of groups.flatMap((g) => g.sourceDocumentIds)) {
    if (seen.has(id)) return false;
    seen.add(id);
    if (repos.sourceDocuments.get(id)?.authorizationStatus !== 'authorized') return false;
    if (repos.projectDocuments.projectOf(id) !== null) return false;
  }
  return true;
}

/**
 * 建立專案後歸入事實項：只看目前未歸專案的事實項，依規則歸到「這次新建」的專案才加入；
 * 已在其他專案的不搬動，歸到既有專案的（使用者移回未歸專案的）也不動。
 */
function assignToNew(repos: Repositories, created: Map<string, ProjectEvidence>): void {
  const assigned = new Set(repos.projectEvidence.list().flatMap((p) => p.claimIds));
  const projectOf = (docId: string) => repos.projectDocuments.projectOf(docId);
  for (const claim of repos.claims.list()) {
    if (assigned.has(claim.id)) continue;
    const target = projectForClaim(claim, projectOf);
    const project = target === null ? undefined : created.get(target);
    if (project) created.set(project.id, { ...project, claimIds: [...project.claimIds, claim.id] });
  }
}

export function createProjectOps(db: DatabaseSync, newId: () => string = storageId): ProjectOps {
  const repos = createRepositories(db);
  const projects = repos.projectEvidence;
  const write = (body: () => ClaimsWriteResult) => Promise.resolve(transaction(db, body));

  return {
    createProjects: ({ projects: groups }) =>
      write(() => {
        if (!documentsUsable(repos, groups)) return INVALID;
        const created = new Map<string, ProjectEvidence>();
        for (const group of groups) {
          const project: ProjectEvidence = {
            id: newId(),
            name: group.name.trim(),
            summary: '', // D23：專案摘要這次不由 AI 填寫
            claimIds: [],
          };
          projects.save(project);
          for (const docId of group.sourceDocumentIds)
            repos.projectDocuments.add(project.id, docId);
          created.set(project.id, project);
        }
        assignToNew(repos, created);
        for (const project of created.values()) projects.save(project);
        return OK;
      }),

    renameProject: ({ projectId, name }) =>
      write(() => {
        const project = projects.get(projectId);
        if (project === null) return NOT_FOUND;
        projects.save({ ...project, name: name.trim() });
        return OK;
      }),

    mergeProjects: ({ projectId, intoProjectId }) =>
      write(() => {
        if (projectId === intoProjectId) return SAME;
        const source = projects.get(projectId);
        const target = projects.get(intoProjectId);
        if (source === null || target === null) return NOT_FOUND;
        const claimIds = [...new Set([...target.claimIds, ...source.claimIds])];
        projects.save({ ...target, claimIds });
        // 先搬文件再刪來源專案（刪專案會連帶刪掉它的文件歸屬）
        repos.projectDocuments.moveAll(source.id, target.id);
        projects.delete(source.id);
        return OK;
      }),

    moveClaim: ({ claimId, projectId }) =>
      write(() => {
        if (repos.claims.get(claimId) === null) return NOT_FOUND;
        const target = projectId === null ? null : projects.get(projectId);
        if (target === null && projectId !== null) return NOT_FOUND;
        for (const project of projects.list()) {
          if (project.id === target?.id || !project.claimIds.includes(claimId)) continue;
          projects.save({ ...project, claimIds: project.claimIds.filter((id) => id !== claimId) });
        }
        if (target && !target.claimIds.includes(claimId)) {
          projects.save({ ...target, claimIds: [...target.claimIds, claimId] });
        }
        return OK;
      }),

    deleteProject: (projectId) => write(() => (projects.delete(projectId) ? OK : NOT_FOUND)),
  };
}
