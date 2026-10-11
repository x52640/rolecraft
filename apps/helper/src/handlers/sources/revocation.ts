// 撤銷授權、移除資料夾當下就套 R2（P1-T060 對抗驗證修正）：不等下次按「分析資料夾」。
// 呼叫端必須包在寫入授權狀態的同一個交易裡。不讀檔、不呼叫模型。
// - 被撤銷的文件在 source_documents 標已撤銷。
// - 只判定「每個引用來源都已不是已授權」的事實項（evaluateClaimSources 只升不降，含撤銷恢復依據）；
//   仍有已授權來源的事實項這裡沒有全文可比對，維持原狀，由下次分析依 R2 判定（只撤銷其中一份
//   來源時 R2 本來就不會讓它變成來源已移除）。
import type { Claim, Id } from '@rolecraft/contracts';
import { evaluateClaimSources, type SourceState } from '@rolecraft/domain';
import type { Repositories } from '@rolecraft/storage';

type RevocationRepos = Pick<Repositories, 'sourceDocuments' | 'claims'>;

/** 依 R2 判定後的事實項；沒變回 null。 */
function reviewed(claim: Claim, states: ReadonlyMap<Id, SourceState>): Claim | null {
  const evaluation = evaluateClaimSources(claim, states);
  const next: Claim = { ...claim, reviewStatus: evaluation.reviewStatus };
  delete next.revocationHold;
  if (evaluation.revocationHold) next.revocationHold = evaluation.revocationHold;
  return JSON.stringify(next) === JSON.stringify(claim) ? null : next;
}

/** 把指定文件標為已撤銷，並對只剩非授權來源的事實項套 R2；回傳更新的事實項數。 */
export function revokeDocuments(repos: RevocationRepos, ids: readonly Id[]): number {
  const revoked = new Set(ids);
  if (revoked.size === 0) return 0;
  for (const id of revoked) {
    const doc = repos.sourceDocuments.get(id);
    if (doc && doc.authorizationStatus !== 'revoked') {
      repos.sourceDocuments.save({ ...doc, authorizationStatus: 'revoked' });
    }
  }
  let updated = 0;
  for (const claim of repos.claims.list()) {
    const cited = claim.basis.sourceExcerpts.map((e) => e.sourceDocumentId);
    if (!cited.some((id) => revoked.has(id))) continue;
    const states = new Map<Id, SourceState>();
    let allInactive = true;
    for (const id of cited) {
      const doc = repos.sourceDocuments.get(id);
      if (doc === null) states.set(id, { kind: 'deleted' });
      else if (doc.authorizationStatus === 'authorized') allInactive = false;
      // 已撤銷的文件不讀內容：R2 對非授權來源只看狀態與保存的指紋
      else states.set(id, { kind: 'present', document: doc, text: '' });
    }
    if (!allInactive) continue;
    const next = reviewed(claim, states);
    if (next) {
      repos.claims.save(next);
      updated += 1;
    }
  }
  return updated;
}
