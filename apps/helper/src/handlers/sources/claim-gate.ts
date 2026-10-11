// 生成與草稿讀事實項時的第二道關（P1-T060 對抗驗證修正，R2、R4）：
// 引用的來源已不是已授權、已不在授權集合（資料夾移除、檔案刪除）就當「來源已移除」，
// 交給 pipeline 的可用判定（只有使用者確認過的仍可用）。資料庫裡的事實項不改，只影響這次輸入。
import type { Claim } from '@rolecraft/contracts';
import { SourceRegistry } from '@rolecraft/sources';

import type { SourcesService } from './service.ts';

export interface ClaimGate {
  /** 重新列舉資料夾（只列不讀）更新「檔案仍在」；列舉失敗的資料夾其下文件一律當不可用 */
  refresh(): Promise<void>;
  apply(claims: readonly Claim[]): Claim[];
}

export function createClaimGate(registry: SourceRegistry): ClaimGate {
  let unreadable = new Set<string>();
  // 每次 apply 只建一次索引：逐筆引用都呼叫 items() 會反覆複製、排序整個清單（codex review）
  const usableIn =
    (byId: ReadonlyMap<string, ReturnType<SourceRegistry['items']>[number]>) =>
    (id: string): boolean => {
      const item = byId.get(id);
      return item?.status === 'authorized' && item.present && !unreadable.has(item.folderId);
    };
  return {
    async refresh() {
      const failed = new Set<string>();
      for (const folder of registry.folders()) {
        try {
          await registry.refreshFolder(folder.id);
        } catch {
          failed.add(folder.id);
        }
      }
      unreadable = failed;
    },
    apply(claims) {
      const usable = usableIn(new Map(registry.items().map((item) => [item.id, item])));
      return claims.map((claim) => {
        if (claim.reviewStatus !== 'normal') return claim; // 已是不可用或來源已移除，不必再降
        const cited = claim.basis.sourceExcerpts.map((e) => e.sourceDocumentId);
        return cited.every(usable) ? claim : { ...claim, reviewStatus: 'source_removed' as const };
      });
    },
  };
}

/** sources 服務帶著授權集合才接得上；沒有就 null（呼叫端不套這道關）。 */
export function claimGateOf(sources: SourcesService | undefined): ClaimGate | null {
  const registry: unknown = (sources as { registry?: unknown } | undefined)?.registry;
  return registry instanceof SourceRegistry ? createClaimGate(registry) : null;
}
