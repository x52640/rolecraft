import { newKey, skillSource, type ProfileBase, type SkillRow } from '../profile-model.ts';
import { SourceNote } from './SourceNote.tsx';

interface SkillEditorProps {
  base: ProfileBase;
  rows: readonly SkillRow[];
  onChange: (rows: SkillRow[]) => void;
}

/** 技能：逐項修改、刪除、新增，每項旁顯示出處。 */
export function SkillEditor({ base, rows, onChange }: SkillEditorProps) {
  return (
    <section className="pf-section" aria-label="技能">
      <h2>技能</h2>
      {rows.length === 0 ? <p className="placeholder-note">沒有技能，可按下方新增。</p> : null}
      {rows.map((row, i) => {
        const n = String(i + 1);
        const old = row.from === null ? null : base.profile.skills[row.from];
        return (
          <div className="pf-row" key={row.key}>
            <input
              aria-label={`技能 ${n}`}
              value={row.value}
              onChange={(e) =>
                onChange(rows.map((r, j) => (j === i ? { ...row, value: e.target.value } : r)))
              }
            />
            <button
              type="button"
              className="pf-remove"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              刪除技能 {n}
            </button>
            <SourceNote
              source={skillSource(base, row.from)}
              added={row.from === null}
              changed={old !== undefined && old !== null && old.trim() !== row.value.trim()}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="pf-add"
        onClick={() => onChange([...rows, { key: newKey(), from: null, value: '' }])}
      >
        新增技能
      </button>
    </section>
  );
}
