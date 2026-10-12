import type { BridgeFailure, ProjectEvidence } from '@rolecraft/contracts';
import { useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';

/**
 * 專案整理（D23、P1-T063）：改名、併入另一專案、刪除。刪除只刪專案，事實項回到未歸專案。
 * 每次成功後呼叫 onChanged，事實項頁重新讀取專案與清單。
 */
export function ProjectTools(props: {
  project: ProjectEvidence;
  others: readonly ProjectEvidence[];
  onChanged: () => void;
}) {
  const bridge = useBridge();
  const { project } = props;
  const [name, setName] = useState(project.name);
  const [into, setInto] = useState('');
  const [asking, setAsking] = useState<'merge' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(
    send: () => Promise<{ ok: true } | BridgeFailure>,
    done: string,
  ): Promise<void> {
    setBusy(true);
    setNotice(null);
    setAsking(null);
    try {
      const res = await send();
      setNotice(res.ok ? done : res.error.message);
      if (res.ok) props.onChanged();
    } finally {
      setBusy(false);
    }
  }

  const target = props.others.find((p) => p.id === into);
  return (
    <section aria-label="整理專案" className="project-tools">
      <label>
        專案名稱
        <input
          value={name}
          maxLength={100}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || name.trim() === '' || name === project.name}
        onClick={() =>
          void act(
            () =>
              bridge.send({
                op: 'claims.rename_project',
                payload: { projectId: project.id, name },
              }),
            '已改名。',
          )
        }
      >
        改名
      </button>
      {props.others.length > 0 ? (
        <label>
          併入
          <select value={into} disabled={busy} onChange={(e) => setInto(e.target.value)}>
            <option value="">選擇專案…</option>
            {props.others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {target && asking !== 'merge' ? (
        <button type="button" disabled={busy} onClick={() => setAsking('merge')}>
          合併
        </button>
      ) : null}
      {target && asking === 'merge' ? (
        <span role="group" aria-label="確認合併">
          把「{project.name}」的事實項與文件併入「{target.name}」，並刪除「{project.name}」？
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () =>
                  bridge.send({
                    op: 'claims.merge_projects',
                    payload: { projectId: project.id, intoProjectId: target.id },
                  }),
                '已合併。',
              )
            }
          >
            確定合併
          </button>
          <button type="button" onClick={() => setAsking(null)}>
            不合併
          </button>
        </span>
      ) : null}
      {asking === 'delete' ? (
        <span role="group" aria-label="確認刪除專案">
          只刪除專案，裡面的事實項會回到「未歸專案」，不會被刪除。
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () =>
                  bridge.send({ op: 'claims.delete_project', payload: { projectId: project.id } }),
                '已刪除專案，事實項已回到未歸專案。',
              )
            }
          >
            確定刪除專案
          </button>
          <button type="button" onClick={() => setAsking(null)}>
            不刪除
          </button>
        </span>
      ) : (
        <button type="button" disabled={busy} onClick={() => setAsking('delete')}>
          刪除專案
        </button>
      )}
      {notice === null ? null : <p role="status">{notice}</p>}
    </section>
  );
}
