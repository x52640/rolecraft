import { useId } from 'react';

import type { ExperienceKey, ExperienceRow } from '../form-model.ts';
import { FieldSource, flaggedClass } from './FieldSource.tsx';
import { PersonalMark } from './PersonalMark.tsx';

type TextKey = 'company' | 'title' | 'startDate';

const orBlank = (value: string): string => (value.trim() === '' ? '未填' : value.trim());

/** 一段經歷一張卡片：標題帶公司／職稱，欄位標籤在上、輸入框在下，描述全寬。 */
export function ExperienceCard(props: {
  row: ExperienceRow;
  index: number;
  onChange: (row: ExperienceRow) => void;
  onRemove: () => void;
}) {
  const { row, index, onChange, onRemove } = props;
  const id = useId();
  const n = String(index + 1);
  const mark = (key: ExperienceKey) => (row.personal?.includes(key) ? <PersonalMark /> : null);
  const field = (key: ExperienceKey) => `import-field${flaggedClass(row.origins?.[key])}`;
  const source = (key: ExperienceKey) => <FieldSource origin={row.origins?.[key]} />;

  const text = (key: TextKey, label: string) => (
    <div className={field(key)}>
      <label htmlFor={`${id}-${key}`}>
        {label}
        {mark(key)}
      </label>
      <input
        id={`${id}-${key}`}
        aria-label={`第 ${n} 段經歷${label}`}
        value={row[key]}
        onChange={(e) => onChange({ ...row, [key]: e.target.value })}
      />
      {source(key)}
    </div>
  );

  return (
    <section
      className="import-card import-experience"
      role="group"
      aria-labelledby={`${id}-heading`}
    >
      <h4 id={`${id}-heading`} className="import-card-title import-card-title-padded">
        第 {n} 段：{orBlank(row.company)}｜{orBlank(row.title)}
      </h4>
      <button
        type="button"
        className="import-btn import-btn-danger import-card-remove"
        aria-label={`刪除第 ${n} 段經歷`}
        onClick={onRemove}
      >
        刪除
      </button>
      <div className="import-experience-grid">
        {text('company', '公司')}
        {text('title', '職稱')}
        {text('startDate', '開始日期')}
        <div className={field('endDate')}>
          <label htmlFor={`${id}-endDate`}>
            結束日期
            {mark('endDate')}
          </label>
          <div className="import-end-date">
            <input
              id={`${id}-endDate`}
              aria-label={`第 ${n} 段經歷結束日期`}
              value={row.endDate}
              disabled={row.current}
              onChange={(e) => onChange({ ...row, endDate: e.target.value })}
            />
            <label className="import-inline-check">
              <input
                type="checkbox"
                aria-label={`第 ${n} 段經歷至今`}
                checked={row.current}
                onChange={(e) => onChange({ ...row, current: e.target.checked })}
              />
              至今
            </label>
          </div>
          {source('endDate')}
        </div>
      </div>
      <div className={field('description')}>
        <label htmlFor={`${id}-description`}>
          描述
          {mark('description')}
        </label>
        <textarea
          id={`${id}-description`}
          aria-label={`第 ${n} 段經歷描述`}
          rows={6}
          value={row.description}
          onChange={(e) => onChange({ ...row, description: e.target.value })}
        />
        {source('description')}
      </div>
    </section>
  );
}
