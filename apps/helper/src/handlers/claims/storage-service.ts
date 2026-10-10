// 事實項服務的 storage 實作（P1-T023）：確認、修改、否決都在 helper 端套用 R1／D14 規則，
// 不相信呼叫端給的狀態或時間。
import type { DatabaseSync } from 'node:sqlite';

import { Claim } from '@rolecraft/contracts';
import { confirmClaim } from '@rolecraft/domain';
import {
  createRepositories,
  deleteMaterial,
  nowTimestamp,
  transaction,
  type FileStore,
} from '@rolecraft/storage';

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

/**
 * 修改內容後的事實項：確認紀錄失效（R1）。原本是「使用者確認完成」的，
 * 已沒有確認依據，退回「未知」（D4：沒有依據的一律視為未知），要重新確認。
 */
export function withEditedText(claim: Claim, text: string): Claim {
  const next: Claim = { ...claim, text, basis: { ...claim.basis, userConfirmation: null } };
  if (claim.completionStatus === 'user_confirmed_done') next.completionStatus = 'unknown';
  return Claim.parse(next);
}

export function createClaimsService(options: ClaimsServiceOptions): ClaimsService {
  const { db, fileStore } = options;
  const now = options.now ?? (() => nowTimestamp());
  const { claims, projectEvidence: projects } = createRepositories(db);

  /** 讀出→改→寫回放在同一交易，避免與其他寫入交錯。 */
  function modify(claimId: string, change: (claim: Claim) => Claim | null): ClaimsWriteResult {
    return transaction(db, () => {
      const claim = claims.get(claimId);
      if (claim === null) return NOT_FOUND;
      const next = change(claim);
      if (next === null) return REJECTED;
      claims.save(next);
      return OK;
    });
  }

  return {
    listProjects: () => Promise.resolve(projects.list()),

    listClaims(projectId) {
      const project = projects.get(projectId);
      if (project === null) return Promise.resolve(null);
      const found = project.claimIds
        .map((id) => claims.get(id))
        .filter((claim): claim is Claim => claim !== null);
      return Promise.resolve(found);
    },

    getClaim: (claimId) => Promise.resolve(claims.get(claimId)),

    confirm(payload) {
      return Promise.resolve(
        modify(payload.claimId, (claim) => {
          const result = confirmClaim(claim, {
            confirmedAt: now(),
            text: payload.text,
            ...(payload.completion === undefined ? {} : { completion: payload.completion }),
          });
          return result.ok ? result.value : null;
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
      if (claims.get(claimId) === null) return Promise.resolve(NOT_FOUND);
      // D19：刪除原件並記錄已刪素材；含其副本的未投遞匯出版本一併刪除、已投遞的保留。
      deleteMaterial(db, fileStore, { kind: 'claim', id: claimId });
      transaction(db, () => {
        for (const project of projects.list()) {
          if (!project.claimIds.includes(claimId)) continue;
          projects.save({ ...project, claimIds: project.claimIds.filter((id) => id !== claimId) });
        }
      });
      return Promise.resolve(OK);
    },
  };
}
