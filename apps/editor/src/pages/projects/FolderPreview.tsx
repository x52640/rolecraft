import type { SourceEntry } from '@rolecraft/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { failureText } from './failure-text.ts';
import {
  buildTree,
  documentIds,
  formatSize,
  initialChecked,
  planChanges,
  suggestedIds,
  toBatches,
  type TreeNode,
} from './preview-model.ts';

interface FolderPreviewProps {
  rootId: string;
  name: string;
  /** 授權變更或重新列舉後通知上層更新資料夾清單。 */
  onChanged: () => void;
}

const STATUS_TEXT = { pending: '待確認', authorized: '已授權', revoked: '不納入' } as const;

/** 一個資料夾的預覽：只列名稱、大小、類型（不讀內容）；勾選後按確認才進授權集合（R4）。 */
export function FolderPreview({ rootId, name, onChanged }: FolderPreviewProps) {
  const bridge = useBridge();
  const [entries, setEntries] = useState<SourceEntry[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await bridge.send({ op: 'sources.preview', payload: { rootId } });
    setBusy(false);
    if (!res.ok) {
      setEntries(null);
      setMessage({ kind: 'error', text: failureText(res) });
      return;
    }
    setEntries(res.entries);
    setChecked(initialChecked(res.entries));
    onChanged();
  }, [bridge, rootId, onChanged]);

  useEffect(() => {
    setMessage(null);
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);
  const pending = (entries ?? []).filter(
    (e) => e.kind === 'document' && e.authorization === 'pending',
  ).length;

  const toggle = (ids: readonly string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const confirm = async () => {
    if (!entries) return;
    const batches = toBatches(planChanges(entries, checked));
    if (batches.length === 0) {
      setMessage({ kind: 'info', text: '沒有變更。' });
      return;
    }
    setBusy(true);
    for (const batch of batches) {
      const res = await bridge.send({
        op: 'sources.update_authorization',
        payload: { rootId, ...batch },
      });
      if (!res.ok) {
        setBusy(false);
        setMessage({ kind: 'error', text: failureText(res) });
        await load();
        return;
      }
    }
    setBusy(false);
    setMessage({ kind: 'info', text: '已更新授權。只有已授權的文件會被讀取。' });
    await load();
  };

  return (
    <section aria-label={`預覽：${name}`}>
      <h2>預覽：{name}</h2>
      {pending > 0 && (
        <p>有 {pending} 個文件待確認：勾選並按「確認」前不會讀取內容；沒勾選的確認後記為不納入。</p>
      )}
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <div>
        <button
          type="button"
          disabled={busy || !entries}
          onClick={() => toggle(suggestedIds(entries ?? []), true)}
        >
          勾選建議文件
        </button>{' '}
        <button type="button" disabled={busy || !entries} onClick={() => setChecked(new Set())}>
          全部取消勾選
        </button>{' '}
        <button type="button" disabled={busy} onClick={() => void load()}>
          重新列舉
        </button>{' '}
        <button type="button" disabled={busy || !entries} onClick={() => void confirm()}>
          確認
        </button>
      </div>
      {entries?.length === 0 && <p>這個資料夾沒有可匯入的文字文件。</p>}
      {entries && entries.length > 0 && (
        <ul aria-label="文件">
          {tree.map((node) => (
            <EntryRow key={node.entry.entryId} node={node} checked={checked} onToggle={toggle} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface EntryRowProps {
  node: TreeNode;
  checked: ReadonlySet<string>;
  onToggle: (ids: readonly string[], on: boolean) => void;
}

function EntryRow({ node, checked, onToggle }: EntryRowProps) {
  const { entry } = node;
  const ids = documentIds(node);
  const count = ids.filter((id) => checked.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  const some = count > 0 && !all;
  const label =
    entry.kind === 'container'
      ? `${entry.name}/`
      : `${entry.name}${entry.suggested ? '（建議）' : ''}`;
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={all}
          disabled={ids.length === 0}
          ref={(el) => {
            if (el) el.indeterminate = some;
          }}
          onChange={(e) => onToggle(ids, e.target.checked)}
        />{' '}
        {label}
      </label>
      {entry.kind === 'document' && (
        <small>
          {' '}
          {formatSize(entry.sizeBytes)}
          {entry.authorization && ` · ${STATUS_TEXT[entry.authorization]}`}
        </small>
      )}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <EntryRow
              key={child.entry.entryId}
              node={child}
              checked={checked}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
