import { useId } from 'react';

import { PersonalMark } from './PersonalMark.tsx';

/** 輸入框寬度跟著字數，但有上限；更長的交給 CSS 限制在欄寬內。 */
const chipSize = (skill: string): number => Math.min(24, Math.max(4, skill.length + 1));

/** 技能：標籤（chip）樣式，可改、可刪單一個、可新增。 */
export function SkillChips(props: {
  skills: readonly string[];
  /** 還原出姓名或聯絡資料的技能值（D28／W7） */
  personal?: readonly string[] | undefined;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const { skills, personal = [], onChange, onRemove, onAdd } = props;
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
                size={chipSize(skill)}
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
              {skill.trim() !== '' && personal.includes(skill.trim()) && <PersonalMark />}
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
