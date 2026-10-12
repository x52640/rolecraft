import type { Claim } from '@rolecraft/contracts';

import { ClaimCard } from './ClaimCard.tsx';
import { UNASSIGNED, useClaimsReview } from './useClaimsReview.ts';
import './claims.css';

type Review = ReturnType<typeof useClaimsReview>;

function ClaimList({ review, claims }: { review: Review; claims: readonly Claim[] }) {
  if (claims.length === 0) {
    return (
      <p>{review.projectId === UNASSIGNED ? '沒有未歸專案的事實項。' : '這個專案還沒有事實項。'}</p>
    );
  }
  const selectedCount = claims.filter(
    (c) => review.selected.has(c.id) && c.reviewStatus === 'normal',
  ).length;
  return (
    <>
      <div className="claims-batch">
        <button
          type="button"
          disabled={review.busy || selectedCount === 0}
          onClick={() => void review.confirmSelected(claims)}
        >
          批次確認所選（{selectedCount}）
        </button>
        <span className="claim-hint">
          批次確認只收複核狀態正常的項目；待複核、來源矛盾、來源已移除的請逐項對照原文確認。
        </span>
      </div>
      {claims.map((claim) => (
        <ClaimCard
          key={claim.id}
          claim={claim}
          busy={review.busy}
          completionChoice={review.choiceOf(claim.id)}
          onCompletionChange={(choice) => review.setChoice(claim.id, choice)}
          selected={review.selected.has(claim.id)}
          onSelectChange={(on) => review.setSelectedOne(claim.id, on)}
          onConfirm={() => void review.confirm(claim)}
          onUpdate={(text) => review.update(claim, text)}
          onReject={() => void review.reject(claim)}
        />
      ))}
    </>
  );
}

/** 事實項頁（F04、R1、R2、D14）：依專案列出事實項，與來源原文並列，由使用者逐項確認。 */
export function ClaimsPage() {
  const review = useClaimsReview();
  const { projects, claims } = review;

  return (
    <section aria-labelledby="page-title" className="claims-page">
      <h1 id="page-title">事實項</h1>
      <p>
        對照右側來源原文逐項確認。文件寫「完成」不等於完成：只有你在這裡確認為「已完成」的項目，履歷才能寫成已完成。確認一次後，所有職缺都能重用。
      </p>

      {projects.state === 'loading' ? <p>讀取專案中…</p> : null}
      {projects.state === 'error' ? <p role="alert">無法讀取專案：{projects.message}</p> : null}
      {projects.state === 'ready' && projects.value.length === 0 ? (
        <p>
          還沒有任何專案。分析出的事實項會先列在「未歸專案」，一樣可以逐項確認；還沒分析的話，先到「匯入」加入專案資料夾並完成分析。
        </p>
      ) : null}
      {projects.state === 'ready' ? (
        <label className="claims-project">
          專案
          <select
            value={review.projectId ?? ''}
            disabled={review.busy}
            onChange={(e) => review.setProjectId(e.target.value)}
          >
            <option value={UNASSIGNED}>未歸專案</option>
            {projects.value.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {review.notice === null ? null : (
        <p role="status" className="claims-notice">
          {review.notice}
        </p>
      )}

      {claims?.state === 'loading' ? <p>讀取事實項中…</p> : null}
      {claims?.state === 'error' ? <p role="alert">無法讀取事實項：{claims.message}</p> : null}
      {claims?.state === 'ready' ? <ClaimList review={review} claims={claims.value} /> : null}
    </section>
  );
}
