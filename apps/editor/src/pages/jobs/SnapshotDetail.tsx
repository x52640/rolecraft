import type { BridgeFailure, JobSnapshot } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { draftFromFields, fieldsFromDraft, sameDraft, type DraftErrors } from './draft.ts';
import { FieldsEditor } from './FieldsEditor.tsx';
import { IntroPanel } from './IntroPanel.tsx';
import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS, failureText, formatTime } from './labels.ts';
import { ConfirmationStatus } from './SnapshotStatus.tsx';

interface SnapshotDetailProps {
  jobSnapshotId: string;
  /** 快照有變（修改或確認）後通知上層重新整理清單。 */
  onChanged: () => void;
  onClose: () => void;
}

/** 快照的來源資訊；網址只顯示為文字，不做成連結（外部內容是資料，D6）。 */
function SnapshotMeta({ snapshot }: { snapshot: JobSnapshot }) {
  return (
    <dl className="job-meta">
      <dt>平台</dt>
      <dd>{PLATFORM_LABELS[snapshot.platform]}</dd>
      <dt>擷取方式</dt>
      <dd data-testid="capture-method">{CAPTURE_METHOD_LABELS[snapshot.captureMethod]}</dd>
      <dt>來源網址</dt>
      <dd>{snapshot.url ?? '（無）'}</dd>
      <dt>擷取時間</dt>
      <dd>{formatTime(snapshot.capturedAt)}</dd>
      <dt>使用者修改</dt>
      <dd data-testid="user-modified">{snapshot.userModified ? '使用者改過' : '未修改'}</dd>
    </dl>
  );
}

/** 單一快照：檢視、修改（記為改過並清除確認）、確認後才能用於生成（R10）。 */
export function SnapshotDetail({ jobSnapshotId, onChanged, onClose }: SnapshotDetailProps) {
  const bridge = useBridge();
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof draftFromFields> | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await bridge.send({ op: 'jobs.get', payload: { jobSnapshotId } });
    if (!response.ok) {
      setFailure(failureText(response));
      return;
    }
    setSnapshot(response.snapshot);
    setDraft(draftFromFields(response.snapshot.fields));
    setErrors({});
  }, [bridge, jobSnapshotId]);

  useEffect(() => {
    setSnapshot(null);
    setDraft(null);
    setMessage(null);
    setFailure(null);
    void load();
  }, [load]);

  if (!snapshot || !draft) {
    return (
      <section aria-label="職缺快照">
        {failure ? <p role="alert">{failure}</p> : <p>讀取中…</p>}
        <button type="button" onClick={onClose}>
          回到清單
        </button>
      </section>
    );
  }

  const dirty = !sameDraft(draft, draftFromFields(snapshot.fields));

  async function run(action: () => Promise<{ ok: true } | BridgeFailure>, done: string) {
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      const response = await action();
      if (!response.ok) {
        setFailure(failureText(response));
        return;
      }
      setMessage(done);
      onChanged();
      // 重新讀取完成前維持鎖定，否則期間的輸入會被讀回的內容蓋掉。
      await load();
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft) return;
    const converted = fieldsFromDraft(draft);
    if (!converted.ok) {
      setErrors(converted.errors);
      return;
    }
    setErrors({});
    void run(
      () =>
        bridge.send({ op: 'jobs.update', payload: { jobSnapshotId, fields: converted.fields } }),
      '已儲存修改。內容改過，需要重新確認才能用於產生履歷。',
    );
  }

  function confirm() {
    void run(
      () => bridge.send({ op: 'jobs.confirm', payload: { jobSnapshotId } }),
      '已確認，這份快照可以用於產生履歷。',
    );
  }

  return (
    <section aria-labelledby="snapshot-title">
      <h2 id="snapshot-title">
        {snapshot.fields.company}／{snapshot.fields.title}
      </h2>
      <SnapshotMeta snapshot={snapshot} />
      <ConfirmationStatus confirmedAt={snapshot.confirmedAt} />
      <FieldsEditor draft={draft} onChange={setDraft} errors={errors} disabled={busy} />
      {failure ? <p role="alert">{failure}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {dirty ? <p className="job-hint">有尚未儲存的修改；儲存後要重新確認。</p> : null}
      <div className="job-actions">
        <button type="button" onClick={save} disabled={busy || !dirty}>
          儲存修改
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || dirty || snapshot.confirmedAt !== null}
        >
          確認快照
        </button>
        <button
          type="button"
          onClick={() => setDraft(draftFromFields(snapshot.fields))}
          disabled={busy || !dirty}
        >
          放棄修改
        </button>
        <button type="button" onClick={onClose} disabled={busy}>
          回到清單
        </button>
      </div>
      <IntroPanel jobSnapshotId={jobSnapshotId} confirmed={snapshot.confirmedAt !== null} />
    </section>
  );
}
