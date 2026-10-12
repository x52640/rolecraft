/** 移動目的地：專案 ID 與名稱；id 為 null 表示未歸專案。 */
export interface MoveTarget {
  id: string | null;
  name: string;
}

const PLACEHOLDER = '__placeholder__';
const UNASSIGNED_VALUE = '__unassigned__';

/** 事實項「移到專案…」（D23）：選了就送出，之後清單重新讀取。 */
export function ClaimMove(props: {
  targets: readonly MoveTarget[];
  busy: boolean;
  onMove: (projectId: string | null) => void;
}) {
  if (props.targets.length === 0) return null;
  return (
    <label className="claim-move">
      <select
        aria-label="移到專案"
        value={PLACEHOLDER}
        disabled={props.busy}
        onChange={(e) => {
          const value = e.target.value;
          if (value === PLACEHOLDER) return;
          props.onMove(value === UNASSIGNED_VALUE ? null : value);
        }}
      >
        <option value={PLACEHOLDER}>移到專案…</option>
        {props.targets.map((t) => (
          <option key={t.id ?? UNASSIGNED_VALUE} value={t.id ?? UNASSIGNED_VALUE}>
            {t.id === null ? '未歸專案' : t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
