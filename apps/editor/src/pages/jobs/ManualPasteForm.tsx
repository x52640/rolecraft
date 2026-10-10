import { HttpUrl, Platform } from '@rolecraft/contracts';
import { useId, useState, type FormEvent } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { emptyDraft, fieldsFromDraft, type DraftErrors } from './draft.ts';
import { FieldsEditor } from './FieldsEditor.tsx';
import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS, failureText } from './labels.ts';

interface ManualPasteFormProps {
  onCreated: (jobSnapshotId: string) => void;
  onCancel: () => void;
}

/**
 * 手動貼上職缺（F06 備援路線、R10）：擷取方式固定為「手動貼上」，畫面與請求都不會標成自動。
 * 貼上的文字只是資料（D6），原樣送給 helper 保存。建立後仍要使用者確認才能用於生成。
 */
export function ManualPasteForm({ onCreated, onCancel }: ManualPasteFormProps) {
  const bridge = useBridge();
  const platformId = useId();
  const urlId = useId();
  const [platform, setPlatform] = useState<Platform>('104');
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [urlError, setUrlError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const converted = fieldsFromDraft(draft);
    const trimmedUrl = url.trim();
    const badUrl = trimmedUrl !== '' && !HttpUrl.safeParse(trimmedUrl).success;
    setErrors(converted.ok ? {} : converted.errors);
    setUrlError(badUrl ? '只接受 http:// 或 https:// 開頭的網址' : null);
    if (!converted.ok || badUrl) return;
    setBusy(true);
    setFailure(null);
    const response = await bridge.send({
      op: 'submit_job_capture',
      payload: {
        platform,
        url: trimmedUrl === '' ? null : trimmedUrl,
        captureMethod: 'manual_paste',
        capturedAt: new Date().toISOString(),
        fields: converted.fields,
      },
    });
    setBusy(false);
    if (response.ok) onCreated(response.jobSnapshotId);
    else setFailure(failureText(response));
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} aria-labelledby="manual-paste-title">
      <h2 id="manual-paste-title">手動貼上職缺</h2>
      <p>
        擷取方式：<strong>{CAPTURE_METHOD_LABELS.manual_paste}</strong>
        。把職缺頁的文字貼進「職缺描述」，再填公司與職稱；其他欄位有就填。建立後要再確認一次才能用於產生履歷。
      </p>
      <div className="job-field">
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
      <div className="job-field">
        <label htmlFor={urlId}>來源網址（選填）</label>
        <input
          id={urlId}
          type="url"
          value={url}
          disabled={busy}
          aria-invalid={urlError ? true : undefined}
          onChange={(e) => setUrl(e.target.value)}
        />
        {urlError ? <p className="job-field-error">{urlError}</p> : null}
      </div>
      <FieldsEditor draft={draft} onChange={setDraft} errors={errors} disabled={busy} />
      {failure ? <p role="alert">{failure}</p> : null}
      <div className="job-actions">
        <button type="submit" disabled={busy}>
          建立快照（手動貼上）
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}
