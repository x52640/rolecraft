import type { Claim } from '@rolecraft/contracts';

import { BatchBar } from './BatchBar.tsx';
import { ClaimCard } from './ClaimCard.tsx';
import type { MoveTarget } from './ClaimMove.tsx';
import { ProjectTools } from './ProjectTools.tsx';
import { UNASSIGNED, useClaimsReview } from './useClaimsReview.ts';
import './claims.css';

type Review = ReturnType<typeof useClaimsReview>;

function ClaimList({ review, claims }: { review: Review; claims: readonly Claim[] }) {
  if (claims.length === 0) {
    return (
      <p>{review.projectId === UNASSIGNED ? '沒有未歸專案的事實項。' : '這個專案還沒有事實項。'}</p>
    );
  }
  // 可移到的地方：其他專案，以及（目前不在未歸專案時）未歸專案（D23）
  const projects = review.projects.state === 'ready' ? review.projects.value : [];
  const moveTargets: MoveTarget[] = [
    ...(review.projectId === UNASSIGNED ? [] : [{ id: null, name: '未歸專案' }]),
    ...projects.filter((p) => p.id !== review.projectId).map((p) => ({ id: p.id, name: p.name })),
  ];
  return (
    <>
      <BatchBar
        claims={claims}
        selected={review.selected}
        busy={review.busy}
        unassigned={review.projectId === UNASSIGNED}
        onSelectAll={review.selectAll}
        onClear={review.clearSelected}
        onConfirm={(targets, completion) => void review.confirmBatch(targets, completion)}
      />
      {claims.map((claim) => (
        <ClaimCard
          key={claim.id}
          claim={claim}
          sourceNames={review.sourceNames}
          busy={review.busy}
          completionChoice={review.choiceOf(claim.id)}
          onCompletionChange={(choice) => review.setChoice(claim.id, choice)}
          selected={review.selected.has(claim.id)}
          onSelectChange={(on) => review.setSelectedOne(claim.id, on)}
          onConfirm={() => void review.confirm(claim)}
          onUpdate={(text) => review.update(claim, text)}
          onReject={() => void review.reject(claim)}
          moveTargets={moveTargets}
          onMove={(target) => void review.move(claim, target)}
        />
      ))}
    </>
  );
}

/** 事實項頁（F04、R1、R2、D14）：依專案列出事實項，與來源原文並列，由使用者逐項確認。 */
export function ClaimsPage() {
  const review = useClaimsReview();
  const { projects, claims } = review;
  const current =
    projects.state === 'ready' ? projects.value.find((p) => p.id === review.projectId) : undefined;

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
          還沒有任何專案。分析出的事實項會先列在「未歸專案」，一樣可以逐項確認；要分專案，到「專案」頁按「建議專案分組」，確認後才會建立。
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

      {projects.state === 'ready' && current ? (
        <ProjectTools
          key={current.id}
          project={current}
          others={projects.value.filter((p) => p.id !== current.id)}
          onChanged={review.projectsChanged}
        />
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
