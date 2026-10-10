import type { SourceRootView } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { failureText } from './failure-text.ts';
import { FolderPreview } from './FolderPreview.tsx';

/**
 * 專案頁：匯入專案資料夾（F03、R4）。資料夾只能經本機輔助程式的系統選取器加入（ADR-0003），
 * 頁面只拿到不透明 ID 與名稱；可連續新增，累積後逐一預覽、勾選、確認。
 */
export function ProjectsPage() {
  const bridge = useBridge();
  const [roots, setRoots] = useState<SourceRootView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await bridge.send({ op: 'sources.list_folders', payload: {} });
    if (!res.ok) {
      setError(failureText(res));
      return;
    }
    setRoots(res.roots);
    setSelected((current) =>
      current !== null && res.roots.some((r) => r.rootId === current) ? current : null,
    );
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPreviewChanged = useCallback(() => void refresh(), [refresh]);

  const addFolders = async () => {
    setBusy(true);
    setError(null);
    const res = await bridge.send({ op: 'sources.pick_folders', payload: {} });
    setBusy(false);
    if (!res.ok) {
      setError(failureText(res));
      return;
    }
    if (res.selection.status === 'selected') {
      const last = res.selection.roots.at(-1);
      if (last) setSelected(last.rootId);
    }
    await refresh();
  };

  const remove = async (rootId: string) => {
    setBusy(true);
    setError(null);
    const res = await bridge.send({ op: 'sources.remove_folder', payload: { rootId } });
    setBusy(false);
    if (!res.ok) setError(failureText(res));
    await refresh();
  };

  const current = roots.find((r) => r.rootId === selected);

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">專案</h1>
      <p>
        加入專案資料夾（可連續新增多個），預覽後勾選要讓 RoleCraft 讀取的文件。只列出 README、
        規格、計畫等文字文件；原始碼、相依套件、建置產物、憑證與隱藏檔會自動排除。
      </p>
      <p role="note" className="placeholder-note">
        專案摘要與事實項（分析結果）尚未實作。
      </p>
      <button type="button" disabled={busy} onClick={() => void addFolders()}>
        新增資料夾
      </button>
      {error && <p role="alert">{error}</p>}
      {roots.length === 0 ? (
        <p>還沒有加入任何資料夾。</p>
      ) : (
        <ul aria-label="已加入的資料夾">
          {roots.map((root) => (
            <li key={root.rootId}>
              <strong>{root.name}</strong> 待確認 {root.pendingCount}・已授權 {root.authorizedCount}{' '}
              <button
                type="button"
                aria-pressed={root.rootId === selected}
                onClick={() => setSelected(root.rootId)}
              >
                預覽 {root.name}
              </button>{' '}
              <button type="button" disabled={busy} onClick={() => void remove(root.rootId)}>
                移除 {root.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <FolderPreview
          key={current.rootId}
          rootId={current.rootId}
          name={current.name}
          onChanged={onPreviewChanged}
        />
      )}
    </section>
  );
}
