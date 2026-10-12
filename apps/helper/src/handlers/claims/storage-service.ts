// 事實項服務的 storage 實作（P1-T023）：確認、修改、否決都在 helper 端套用 R1／D14 規則，
// 不相信呼叫端給的狀態或時間。
import type { DatabaseSync } from 'node:sqlite';

import { Claim } from '@rolecraft/contracts';
import { confirmClaim } from '@rolecraft/domain';
import {
  createRepositories,
  deleteMaterial,
  isMaterialDeleted,
  nowTimestamp,
  transaction,
  type FileStore,
} from '@rolecraft/storage';

import { createProjectOps } from './projects-service.ts';
import type { ClaimsService, ClaimsWriteResult } from './service.ts';

/** helper 的本機儲存：SQLite 連線＋檔案儲存區（刪除素材時清 PDF 用）。 */
export interface HelperStorage {
  db: DatabaseSync;
  fileStore: FileStore;
}

export interface ClaimsServiceOptions extends HelperStorage {
  /** 測試用：確認時間來源；預設現在時間。呼叫端（頁面）不能指定確認時間。 */
  now?: () => string;
}

const OK: ClaimsWriteResult = { ok: true };
const NOT_FOUND: ClaimsWriteResult = { ok: false, reason: 'not_found' };
const REJECTED: ClaimsWriteResult = { ok: false, reason: 'rejected' };
const STALE: ClaimsWriteResult = { ok: false, reason: 'stale' };

/**
 * 修改內容後的事實項（R1、R2）：確認紀錄失效，而且舊來源片段不再替新文字背書——
 * 複核狀態改待複核（來源已移除維持標示），有完成狀態的一律退回「未知」，直到使用者重新確認。
 */
export function withEditedText(claim: Claim, text: string): Claim {
  const next: Claim = {
    ...claim,
    text,
    basis: { ...claim.basis, userConfirmation: null },
    reviewStatus: claim.reviewStatus === 'source_removed' ? 'source_removed' : 'needs_review',
  };
  if (claim.completionStatus !== undefined) next.completionStatus = 'unknown';
  // 內容改過就不再自動恢復，改回原文也一樣（evidence-model R2 擁有者裁定 #15）
  delete next.revocationHold;
  return Claim.parse(next);
}

export function createClaimsService(options: ClaimsServiceOptions): ClaimsService {
  const { db, fileStore } = options;
  const now = options.now ?? (() => nowTimestamp());
  const { claims, projectEvidence: projects } = createRepositories(db);

  /** 讀出→改→寫回放在同一交易，避免與其他寫入交錯。 */
  function modify(
    claimId: string,
    change: (claim: Claim) => Claim | ClaimsWriteResult,
  ): ClaimsWriteResult {
    return transaction(db, () => {
      const claim = claims.get(claimId);
      if (claim === null) return NOT_FOUND;
      const next = change(claim);
      if ('ok' in next) return next;
      claims.save(next);
      return OK;
    });
  }

  /** 刪除失敗時把事實項加回原本引用它的專案（專案已不存在或已含它就略過）。 */
  function restoreLinks(claimId: string, positions: ReadonlyMap<string, number>): void {
    transaction(db, () => {
      for (const [projectId, index] of positions) {
        const project = projects.get(projectId);
        if (project === null || project.claimIds.includes(claimId)) continue;
        const claimIds = [...project.claimIds];
        claimIds.splice(Math.min(index, claimIds.length), 0, claimId);
        projects.save({ ...project, claimIds });
      }
    });
  }

  return {
    // 專案建立與整理（P1-T063）
    ...createProjectOps(db),

    listProjects: () => Promise.resolve(projects.list()),

    listClaims(projectId) {
      const project = projects.get(projectId);
      if (project === null) return Promise.resolve(null);
      const found = project.claimIds
        .map((id) => claims.get(id))
        .filter((claim): claim is Claim => claim !== null);
      return Promise.resolve(found);
    },

    listUnassigned() {
      // 同一交易讀專案與事實項，避免讀到一半被歸入專案或否決而前後不一致
      return Promise.resolve(
        transaction(db, () => {
          const assigned = new Set(projects.list().flatMap((p) => p.claimIds));
          // claims.list() 依建立順序；否決（D19）會刪掉事實項列，所以已刪除的不會出現
          return claims.list().filter((claim) => !assigned.has(claim.id));
        }),
      );
    },

    getClaim: (claimId) => Promise.resolve(claims.get(claimId)),

    confirm(payload) {
      return Promise.resolve(
        modify(payload.claimId, (claim) => {
          // 畫面看到的複核狀態與目前不同（例如期間轉成待複核、來源矛盾）：拒絕，不寫入（R2）
          if (claim.reviewStatus !== payload.expectedReviewStatus) return STALE;
          const result = confirmClaim(claim, {
            confirmedAt: now(),
            text: payload.text,
            ...(payload.completion === undefined ? {} : { completion: payload.completion }),
          });
          return result.ok ? result.value : REJECTED;
        }),
      );
    },

    update(payload) {
      return Promise.resolve(
        modify(payload.claimId, (claim) =>
          claim.text === payload.text ? claim : withEditedText(claim, payload.text),
        ),
      );
    },

    reject(claimId) {
      // 先在自己的交易移除各專案的引用，再刪素材（D19）。deleteMaterial 不能放進外層交易，
      // 所以刪除失敗而事實項仍在時，要把引用加回原位置，清單仍看得到、可以重試。
      const removed = transaction(db, () => {
        const positions = new Map<string, number>();
        for (const project of projects.list()) {
          const index = project.claimIds.indexOf(claimId);
          if (index === -1) continue;
          projects.save({ ...project, claimIds: project.claimIds.filter((id) => id !== claimId) });
          positions.set(project.id, index);
        }
        return positions;
      });
      // 事實項已不存在：引用已清，回成功（bridge.md：可重試）。是否成功不看這次有沒有移除引用，
      // 而看它是否被刪過（D19 紀錄）；從來沒有過的 ID 才回找不到。
      if (claims.get(claimId) === null) {
        const known = removed.size > 0 || isMaterialDeleted(db, { kind: 'claim', id: claimId });
        return Promise.resolve(known ? OK : NOT_FOUND);
      }
      try {
        // D19：刪除原件並記錄已刪素材；含其副本的未投遞匯出版本一併刪除、已投遞的保留。
        deleteMaterial(db, fileStore, { kind: 'claim', id: claimId });
      } catch (error) {
        if (claims.get(claimId) !== null) restoreLinks(claimId, removed);
        throw error;
      }
      return Promise.resolve(OK);
    },
  };
}
