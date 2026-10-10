import type { Claim, ClaimCitation, ResumeSection, StatedCompletion } from '@rolecraft/contracts';
import { useState } from 'react';

import { needsCompletion } from '../claims/labels.ts';
import { STATED_LABELS, downgradedClaimIds } from './labels.ts';

interface Props {
  section: ResumeSection;
  claims: ReadonlyMap<string, Claim>;
  /** 可新增引用的事實項；null＝尚未載入 */
  allClaims: readonly Claim[] | null;
  busy: boolean;
  onLoadClaims: () => void;
  onSave: (text: string, citations: ClaimCitation[], acknowledged: boolean) => void;
  onCancel: () => void;
}

const STATED = Object.keys(STATED_LABELS) as StatedCompletion[];

/**
 * 自行編輯段落（R1）：原有引用不能移除（要去掉只能刪整段），只能新增；
 * 宣稱完成程度被調低時，必須勾選「已重看措辭」才能儲存。
 */
export function SectionEditor(props: Props) {
  const { section } = props;
  const [text, setText] = useState(section.text);
  const [citations, setCitations] = useState<ClaimCitation[]>(section.citations);
  const [acknowledged, setAcknowledged] = useState(false);
  const [adding, setAdding] = useState('');
  const original = new Set(section.citations.map((c) => c.claimId));
  const downgraded = downgradedClaimIds(section.citations, citations);
  const claimText = (id: string) =>
    props.claims.get(id)?.text ?? props.allClaims?.find((c) => c.id === id)?.text ?? id;

  const setStated = (claimId: string, value: string) =>
    setCitations((list) =>
      list.map((c) =>
        c.claimId !== claimId
          ? c
          : value === ''
            ? { claimId }
            : { claimId, statedCompletion: value as StatedCompletion },
      ),
    );

  const addable = (props.allClaims ?? []).filter((c) => !citations.some((x) => x.claimId === c.id));

  return (
    <form
      aria-label="編輯段落"
      className="section-editor"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave(text, citations, downgraded.length > 0 && acknowledged);
      }}
    >
      <label>
        段落內容
        <textarea value={text} rows={4} onChange={(e) => setText(e.target.value)} />
      </label>
      <fieldset>
        <legend>引用的事實項（原有的不能移除；要去掉引用只能刪除整段）</legend>
        <ul>
          {citations.map((c) => (
            <li key={c.claimId}>
              {claimText(c.claimId)}
              <select
                aria-label={`寫成的完成程度：${claimText(c.claimId)}`}
                value={c.statedCompletion ?? ''}
                onChange={(e) => setStated(c.claimId, e.target.value)}
              >
                <option value="">（不標示）</option>
                {STATED.map((s) => (
                  <option key={s} value={s}>
                    {STATED_LABELS[s]}
                  </option>
                ))}
              </select>
              {original.has(c.claimId) ? null : (
                <button
                  type="button"
                  onClick={() => setCitations((l) => l.filter((x) => x.claimId !== c.claimId))}
                >
                  取消新增
                </button>
              )}
            </li>
          ))}
        </ul>
        {props.allClaims === null ? (
          <button type="button" onClick={props.onLoadClaims}>
            新增引用…
          </button>
        ) : (
          <label>
            新增引用
            <select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">選擇事實項</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.text}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={adding === ''}
              onClick={() => {
                const claim = addable.find((c) => c.id === adding);
                if (!claim) return;
                // 功能／交付物預設寫成「規劃中」（最保守），要改再自己選
                const stated = needsCompletion(claim)
                  ? { statedCompletion: 'planned' as const }
                  : {};
                setCitations((l) => [...l, { claimId: claim.id, ...stated }]);
                setAdding('');
              }}
            >
              加入
            </button>
          </label>
        )}
      </fieldset>
      {downgraded.length > 0 ? (
        <div role="alert" className="resume-warning">
          <p>
            你把「{downgraded.map(claimText).join('、')}
            」的完成程度調低了。原本的措辭可能仍寫成已完成，
            請重看並修改本段文字，確認沒有寫得比引用更完成。
          </p>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            我已重看本段措辭
          </label>
        </div>
      ) : null}
      <button type="submit" disabled={props.busy || (downgraded.length > 0 && !acknowledged)}>
        儲存
      </button>
      <button type="button" onClick={props.onCancel}>
        取消
      </button>
    </form>
  );
}
