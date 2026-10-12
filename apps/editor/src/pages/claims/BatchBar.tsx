import type { Claim, ConfirmableCompletion } from '@rolecraft/contracts';
import { useState } from 'react';

import { batchBlockReason, needsCompletion } from './labels.ts';

export interface BatchBarProps {
  claims: readonly Claim[];
  selected: ReadonlySet<string>;
  busy: boolean;
  /** 目前看的是未歸專案（按鈕文字用） */
  unassigned: boolean;
  onSelectAll: (ids: readonly string[]) => void;
  onClear: () => void;
  onConfirm: (targets: readonly Claim[], completion: ConfirmableCompletion | '') => void;
}

const CHOICE_LABELS: Record<ConfirmableCompletion, string> = {
  user_confirmed_done: '已完成',
  planned: '計畫中',
};

/**
 * 批次確認（P1-T073）：勾選的項目一次設定完成狀態並確認。只收尚未確認、複核狀態正常的項目；
 * 完成狀態不預設（避免順手確認成「已完成」），按下後先顯示將確認的數量，再按一次才送出。
 */
export function BatchBar(props: BatchBarProps) {
  const [choice, setChoice] = useState<ConfirmableCompletion | ''>('');
  const [asking, setAsking] = useState(false);
  const batchable = props.claims.filter((c) => batchBlockReason(c) === null);
  const targets = batchable.filter((c) => props.selected.has(c.id));
  const withCompletion = targets.filter(needsCompletion).length;
  const needChoice = withCompletion > 0 && choice === '';
  const canSubmit = !props.busy && targets.length > 0 && !needChoice;

  return (
    <div className="claims-batch" role="group" aria-label="批次確認">
      <button
        type="button"
        disabled={props.busy || batchable.length === 0}
        onClick={() => props.onSelectAll(batchable.map((c) => c.id))}
      >
        {`${props.unassigned ? '全選未歸專案中可批次的項目' : '全選本專案可批次的項目'}（${String(batchable.length)}）`}
      </button>
      <button
        type="button"
        disabled={props.busy || targets.length === 0}
        onClick={() => {
          setAsking(false);
          props.onClear();
        }}
      >
        清除勾選
      </button>
      <label>
        把勾選的設為
        <select
          value={choice}
          disabled={props.busy}
          onChange={(e) => {
            setAsking(false);
            setChoice(e.target.value as ConfirmableCompletion | '');
          }}
        >
          <option value="">請選擇</option>
          <option value="user_confirmed_done">已完成</option>
          <option value="planned">計畫中</option>
        </select>
      </label>
      <button type="button" disabled={!canSubmit} onClick={() => setAsking(true)}>
        {`設定並確認（${String(targets.length)}）`}
      </button>
      {needChoice ? (
        <span className="claim-hint">勾選的項目含功能／交付物，請先選「已完成」或「計畫中」。</span>
      ) : null}
      {asking && canSubmit ? (
        <span role="group" aria-label="確認批次">
          {`將確認 ${String(targets.length)} 項`}
          {withCompletion > 0 && choice !== ''
            ? `：其中 ${String(withCompletion)} 項功能／交付物設為「${CHOICE_LABELS[choice]}」，其他 ${String(targets.length - withCompletion)} 項只確認內容。`
            : '（都不是功能／交付物，只確認內容）。'}
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              props.onConfirm(targets, choice);
            }}
          >
            確定確認
          </button>
          <button type="button" onClick={() => setAsking(false)}>
            取消
          </button>
        </span>
      ) : null}
      <span className="claim-hint">
        只能勾尚未確認、狀態正常的項目；待複核、來源矛盾、來源已移除的請逐項對照原文確認。也可以逐項按「確認此項」。
      </span>
    </div>
  );
}
