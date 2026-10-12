import { useId } from 'react';

/** 技能：標籤（chip）樣式，可改、可刪單一個、可新增。 */
export function SkillChips(props: {
  skills: readonly string[];
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const { skills, onChange, onRemove, onAdd } = props;
  const id = useId();
  return (
    <section className="import-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="import-card-title">
        技能
      </h3>
      {skills.length === 0 && <p className="placeholder-note">尚無技能，可按下方新增。</p>}
      <ul className="import-chips" aria-label="技能清單">
        {skills.map((skill, i) => {
          const n = String(i + 1);
          return (
            <li key={i} className="import-chip">
              <label className="import-visually-hidden" htmlFor={`${id}-${n}`}>
                技能 {n}
              </label>
              <input
                id={`${id}-${n}`}
                value={skill}
                size={Math.max(4, skill.length + 1)}
                onChange={(e) => onChange(i, e.target.value)}
              />
              <button
                type="button"
                className="import-chip-remove"
                aria-label={`刪除技能 ${n}`}
                title="刪除"
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="import-btn import-btn-secondary" onClick={onAdd}>
        新增技能
      </button>
    </section>
  );
}
