import type { JobSnapshotSummary } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import './jobs.css';
import { failureText } from './labels.ts';
import { ManualPasteForm } from './ManualPasteForm.tsx';
import { SnapshotDetail } from './SnapshotDetail.tsx';
import { SnapshotList } from './SnapshotList.tsx';

type View = { kind: 'list' } | { kind: 'paste' } | { kind: 'detail'; id: string };

/**
 * 職缺頁（F06、R10）：快照清單、手動貼上建立快照、檢視／修改／確認單一快照。
 * 職缺內容一律只當資料顯示（D6）：純文字、不轉成連結或 HTML。
 */
export function JobsPage() {
  const bridge = useBridge();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [snapshots, setSnapshots] = useState<JobSnapshotSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await bridge.send({ op: 'jobs.list', payload: {} });
    if (response.ok) {
      setSnapshots(response.snapshots);
      setFailure(null);
    } else {
      setFailure(failureText(response));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">職缺</h1>
      <p>管理擷取或手動貼上的職缺快照。快照要經你確認，才能用來產生履歷；改過之後要重新確認。</p>
      <p role="note" className="placeholder-note">
        職缺頁自動擷取尚未實作（104 擷取另案進行；LinkedIn 只走手動）。目前請用手動貼上建立快照。
      </p>
      {failure ? <p role="alert">{failure}</p> : null}
      {view.kind === 'paste' ? (
        <ManualPasteForm
          onCancel={() => setView({ kind: 'list' })}
          onCreated={(id) => {
            void reload();
            setView({ kind: 'detail', id });
          }}
        />
      ) : (
        <>
          <div className="job-actions">
            <button type="button" onClick={() => setView({ kind: 'paste' })}>
              手動貼上職缺
            </button>
          </div>
          {snapshots ? (
            <SnapshotList
              snapshots={snapshots}
              selectedId={view.kind === 'detail' ? view.id : null}
              onOpen={(id) => setView({ kind: 'detail', id })}
            />
          ) : null}
          {view.kind === 'detail' ? (
            <SnapshotDetail
              key={view.id}
              jobSnapshotId={view.id}
              onChanged={() => void reload()}
              onClose={() => setView({ kind: 'list' })}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
