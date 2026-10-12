import type {
  Claim,
  ExportIssueView,
  ResumeSection,
  SectionBlockerView,
} from '@rolecraft/contracts';
import { useState } from 'react';

import { hrefFor } from '../../app/router.ts';
import { COMPLETION_LABELS, TYPE_LABELS } from '../claims/labels.ts';
import { SectionCopy } from './copy/SectionCopy.tsx';
import { DECISION_LABELS, STATED_LABELS, placementLabel } from './labels.ts';

interface Props {
  section: ResumeSection;
  original: string | null;
  claims: ReadonlyMap<string, Claim>;
  issues: readonly ExportIssueView[];
  blockers: readonly SectionBlockerView[];
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}

/** 需要到事實項上處理的問題（檢查 2、事實項不可用）。 */
const CLAIM_CHECKS = new Set(['completion', 'claim_usability']);

function Citations({ section, claims }: Pick<Props, 'section' | 'claims'>) {
  if (section.citations.length === 0) return <p className="resume-hint">沒有引用任何事實項。</p>;
  return (
    <ul className="resume-citations">
      {section.citations.map((c) => {
        const claim = claims.get(c.claimId);
        return (
          <li key={c.claimId}>
            {claim ? `${TYPE_LABELS[claim.type]}：${claim.text}` : '（找不到這個事實項）'}
            {c.statedCompletion ? `｜本段寫成「${STATED_LABELS[c.statedCompletion]}」` : ''}
            {claim?.completionStatus
              ? `｜事實項狀態：${COMPLETION_LABELS[claim.completionStatus]}`
              : ''}
          </li>
        );
      })}
    </ul>
  );
}

/** 一段的原文與修改稿對照、引用、理由與逐段把關動作（F07、R1）。 */
export function SectionCard(props: Props) {
  const { section, issues } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const decision = section.decision ?? 'pending';
  const blank = section.text.trim() === '';
  const confirmable = issues.length > 0 && issues.every((i) => i.resolvableBySectionConfirmation);
  const needsClaimWork = issues.some((i) => CLAIM_CHECKS.has(i.check));
  const confirmation = section.sectionConfirmation;

  return (
    <article aria-label={section.text || '空白段落'} className="resume-section">
      <p className="resume-meta">
        {placementLabel(section)}｜{section.origin === 'generated' ? '模型生成' : '你自己寫的'}｜
        {DECISION_LABELS[decision]}
      </p>
      <div className="resume-compare">
        <div>
          <h3>原文</h3>
          <p>{props.original ?? '（這段沒有可對照的原文）'}</p>
        </div>
        <div>
          <h3>修改稿</h3>
          <p>{section.text}</p>
          {section.rationale ? <p className="resume-hint">修改理由：{section.rationale}</p> : null}
        </div>
      </div>
      <Citations section={section} claims={props.claims} />
      <p className="resume-hint">
        請確認措辭沒有寫得比事實項更完成。接受只接受措辭，不會確認任何事實項。
      </p>
      {confirmation !== null && confirmation.text === section.text ? (
        <p className="resume-hint">你已逐段確認本段內容屬實。</p>
      ) : null}
      {issues.length + props.blockers.length > 0 ? (
        <ul className="resume-issues" aria-label="匯出前問題">
          {issues.map((i, n) => (
            <li key={`i${String(n)}`}>{i.message}</li>
          ))}
          {props.blockers.map((b) => (
            <li key={b.reason}>{b.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="resume-actions">
        <button
          type="button"
          disabled={props.busy || decision === 'accepted'}
          onClick={props.onAccept}
        >
          接受措辭
        </button>
        <button
          type="button"
          disabled={props.busy || decision === 'rejected'}
          onClick={props.onReject}
        >
          退回
        </button>
        <button type="button" disabled={props.busy} onClick={props.onEdit}>
          改寫
        </button>
        {confirmable && !blank ? (
          <button type="button" disabled={props.busy} onClick={props.onConfirm}>
            逐段確認本段屬實
          </button>
        ) : null}
        <SectionCopy gate={{ section, issues, blockers: props.blockers }} busy={props.busy} />
        {needsClaimWork ? <a href={hrefFor('claims')}>到事實項頁確認</a> : null}
        {confirmDelete ? (
          <>
            <button type="button" disabled={props.busy} onClick={props.onDelete}>
              確定刪除整段
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}>
              不刪
            </button>
          </>
        ) : (
          <button type="button" disabled={props.busy} onClick={() => setConfirmDelete(true)}>
            刪除整段
          </button>
        )}
      </div>
    </article>
  );
}
