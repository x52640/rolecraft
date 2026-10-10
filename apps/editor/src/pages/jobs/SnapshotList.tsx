import type { JobSnapshotSummary } from '@rolecraft/contracts';

import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS, formatTime } from './labels.ts';

interface SnapshotListProps {
  snapshots: readonly JobSnapshotSummary[];
  selectedId: string | null;
  onOpen: (jobSnapshotId: string) => void;
}

/** 快照清單：照實標示擷取方式、是否改過、是否已確認。 */
export function SnapshotList({ snapshots, selectedId, onOpen }: SnapshotListProps) {
  if (snapshots.length === 0) {
    return <p>還沒有職缺快照。可以先用「手動貼上職缺」建立一份。</p>;
  }
  return (
    <table className="job-list">
      <thead>
        <tr>
          <th scope="col">公司／職稱</th>
          <th scope="col">平台</th>
          <th scope="col">擷取方式</th>
          <th scope="col">擷取時間</th>
          <th scope="col">狀態</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <tr key={s.id} aria-selected={s.id === selectedId}>
            <td>
              {s.company}／{s.title}
            </td>
            <td>{PLATFORM_LABELS[s.platform]}</td>
            <td>{CAPTURE_METHOD_LABELS[s.captureMethod]}</td>
            <td>{formatTime(s.capturedAt)}</td>
            <td>
              {s.confirmedAt ? '已確認' : '未確認'}
              {s.userModified ? '・使用者改過' : ''}
            </td>
            <td>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                aria-label={`開啟 ${s.company}／${s.title}`}
              >
                開啟
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
