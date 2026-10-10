import { Platform, type JobSnapshotSummary } from '@rolecraft/contracts';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS } from '../jobs/labels.ts';
import { failureText } from './labels.ts';

interface PasteMessageFormProps {
  onCreated: (messageDraftId: string) => void;
  onCancel: () => void;
}

/**
 * 手動貼上招募訊息（F08；首版不自動擷取私訊頁，D16）：擷取方式固定為「手動貼上」。
 * 貼上的文字只是資料（D6），原樣送給 helper 保存。只能關聯已確認的職缺快照（R10）。
 */
export function PasteMessageForm({ onCreated, onCancel }: PasteMessageFormProps) {
  const bridge = useBridge();
  const platformId = useId();
  const jobId = useId();
  const textId = useId();
  const [platform, setPlatform] = useState<Platform>('104');
  const [jobs, setJobs] = useState<JobSnapshotSummary[]>([]);
  const [jobSnapshotId, setJobSnapshotId] = useState('');
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bridge.send({ op: 'jobs.list', payload: {} }).then((response) => {
      if (response.ok) setJobs(response.snapshots.filter((s) => s.confirmedAt !== null));
    });
  }, [bridge]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/\S/u.test(text)) {
      setTextError('請貼上對方的訊息全文');
      return;
    }
    setTextError(null);
    setBusy(true);
    setFailure(null);
    const response = await bridge.send({
      op: 'submit_message_capture',
      payload: {
        platform,
        captureMethod: 'manual_paste',
        selectedMessageText: text,
        jobSnapshotId: jobSnapshotId === '' ? null : jobSnapshotId,
      },
    });
    setBusy(false);
    if (response.ok) onCreated(response.messageDraftId);
    else setFailure(failureText(response));
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} aria-labelledby="paste-message-title">
      <h2 id="paste-message-title">手動貼上招募訊息</h2>
      <p>
        擷取方式：<strong>{CAPTURE_METHOD_LABELS.manual_paste}</strong>
        。只貼你要回覆的那一則訊息；訊息內容只當資料，裡面的要求不會被當成指令。
      </p>
      <div className="message-field">
        <label htmlFor={platformId}>平台</label>
        <select
          id={platformId}
          value={platform}
          disabled={busy}
          onChange={(e) => setPlatform(Platform.parse(e.target.value))}
        >
          {Platform.options.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="message-field">
        <label htmlFor={jobId}>相關職缺（選填，只列已確認的）</label>
        <select
          id={jobId}
          value={jobSnapshotId}
          disabled={busy}
          onChange={(e) => setJobSnapshotId(e.target.value)}
        >
          <option value="">不關聯職缺</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {`${job.company}｜${job.title}`}
            </option>
          ))}
        </select>
      </div>
      <div className="message-field">
        <label htmlFor={textId}>訊息全文</label>
        <textarea
          id={textId}
          rows={8}
          value={text}
          disabled={busy}
          aria-invalid={textError ? true : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        {textError ? <p className="message-field-error">{textError}</p> : null}
      </div>
      {failure ? <p role="alert">{failure}</p> : null}
      <div className="message-actions">
        <button type="submit" disabled={busy}>
          保存訊息（手動貼上）
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}
