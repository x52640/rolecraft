import type { ApplicationRecord, ExportVersionSummary } from '@rolecraft/contracts';
import { useState } from 'react';

import { ApplicationForm } from './ApplicationForm.tsx';
import { INITIATION_LABELS, labelFor, timestampToDate } from './model.ts';
import type { ApplicationFields } from './useApplications.ts';

interface ApplicationRowProps {
  application: ApplicationRecord;
  versions: readonly ExportVersionSummary[];
  onUpdate: (applicationId: string, fields: ApplicationFields) => Promise<string | null>;
  onDelete: (applicationId: string) => Promise<string | null>;
}

type Mode = 'view' | 'edit' | 'confirm-delete';

/** 一筆投遞紀錄：檢視、修改（實際投出版本不可改）、整筆刪除（D19，要再按一次確認）。 */
export function ApplicationRow({ application, versions, onUpdate, onDelete }: ApplicationRowProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = timestampToDate(application.appliedAt);
  const version = labelFor(application.exportVersionId, versions);

  async function confirmDelete() {
    setBusy(true);
    const message = await onDelete(application.id);
    setBusy(false);
    setError(message);
    if (message) setMode('view');
  }

  if (mode === 'edit') {
    return (
      <li>
        <ApplicationForm
          name={`修改 ${date} 的投遞紀錄`}
          initial={{
            initiation: application.initiation,
            date,
            status: application.status,
            exportVersionId: application.exportVersionId,
          }}
          versions={versions}
          versionLocked
          originalAppliedAt={application.appliedAt}
          submitLabel="儲存"
          onSubmit={async (fields) => {
            const message = await onUpdate(application.id, fields);
            if (!message) setMode('view');
            return message;
          }}
          onCancel={() => setMode('view')}
        />
      </li>
    );
  }

  return (
    <li aria-label={`${date} ${version}`}>
      <p>
        {date}｜{INITIATION_LABELS[application.initiation]}｜{application.status}
      </p>
      <p>實際投出版本：{version}</p>
      {mode === 'confirm-delete' ? (
        <div role="group" aria-label="確認刪除">
          <p>
            整筆刪除這筆投遞紀錄？匯出版本本身不會因此刪除；但若它含有你已刪除素材的副本、
            且沒有其他投遞紀錄指向它，會依「未投遞整份刪除」一併刪除。
          </p>
          <button type="button" onClick={() => void confirmDelete()} disabled={busy}>
            確認刪除
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy}>
            取消
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setMode('edit')}>
            修改
          </button>
          <button type="button" onClick={() => setMode('confirm-delete')}>
            刪除
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
