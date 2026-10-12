import {
  baseInfoValue,
  infoSource,
  newKey,
  sendValue,
  type InfoRow,
  type ProfileBase,
} from '../profile-model.ts';
import { SourceNote } from './SourceNote.tsx';

interface InfoEditorProps {
  base: ProfileBase;
  rows: readonly InfoRow[];
  onChange: (rows: InfoRow[]) => void;
}

/** 這一列跟基準比有沒有改（欄位名或值）。 */
function rowChanged(base: ProfileBase, row: InfoRow): boolean {
  if (row.from === null) return false;
  const old = baseInfoValue(base, row.from);
  return sendValue(row.label, row.from) !== row.from || sendValue(row.value, old) !== old;
}

/** 基本資料（personalInfo 各列，含「學歷」列）：逐列改欄位名與值、刪除、新增。 */
export function InfoEditor({ base, rows, onChange }: InfoEditorProps) {
  const replace = (i: number, next: InfoRow) => onChange(rows.map((r, j) => (j === i ? next : r)));
  return (
    <section className="pf-section" aria-label="基本資料">
      <h2>基本資料</h2>
      {rows.length === 0 ? <p className="placeholder-note">沒有基本資料，可按下方新增。</p> : null}
      {rows.map((row, i) => {
        const n = String(i + 1);
        return (
          <div className="pf-row" key={row.key}>
            <input
              aria-label={`基本資料 ${n} 欄位名稱`}
              value={row.label}
              onChange={(e) => replace(i, { ...row, label: e.target.value })}
            />
            {/* 學歷等值可能有多行：用 textarea 保留換行（單行 input 會吃掉換行並寫回） */}
            <textarea
              aria-label={`基本資料 ${n} 內容`}
              rows={Math.min(6, row.value.split('\n').length)}
              value={row.value}
              onChange={(e) => replace(i, { ...row, value: e.target.value })}
            />
            <button
              type="button"
              className="pf-remove"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              刪除基本資料 {n}
            </button>
            <SourceNote
              source={infoSource(base, row.from)}
              added={row.from === null}
              changed={rowChanged(base, row)}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="pf-add"
        onClick={() => onChange([...rows, { key: newKey(), from: null, label: '', value: '' }])}
      >
        新增基本資料
      </button>
    </section>
  );
}
