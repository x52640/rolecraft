import { useId } from 'react';

import type { InfoRow } from '../form-model.ts';
import { PersonalMark } from './PersonalMark.tsx';

/** 個人資料：欄位名稱＋內容兩欄格線，每列一個次要的刪除鈕。 */
export function InfoRows(props: {
  rows: readonly InfoRow[];
  onChange: (index: number, row: InfoRow) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const { rows, onChange, onRemove, onAdd } = props;
  const id = useId();
  return (
    <section className="import-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="import-card-title">
        個人資料
      </h3>
      {rows.length > 0 && (
        <div className="import-info-grid">
          <span className="import-info-head" aria-hidden="true">
            欄位
          </span>
          <span className="import-info-head" aria-hidden="true">
            內容
          </span>
          <span aria-hidden="true" />
          {rows.map((row, i) => {
            const n = String(i + 1);
            const valueName = row.label.trim() === '' ? `個人資料第 ${n} 列` : row.label;
            return (
              <div key={i} className="import-info-row">
                <label className="import-visually-hidden" htmlFor={`${id}-${n}-label`}>
                  個人資料第 {n} 列名稱
                </label>
                <input
                  id={`${id}-${n}-label`}
                  className="import-info-label"
                  value={row.label}
                  onChange={(e) => onChange(i, { ...row, label: e.target.value })}
                />
                <label className="import-visually-hidden" htmlFor={`${id}-${n}-value`}>
                  {valueName}
                </label>
                <div className="import-info-value">
                  <input
                    id={`${id}-${n}-value`}
                    value={row.value}
                    onChange={(e) => onChange(i, { ...row, value: e.target.value })}
                  />
                  {row.personal === true && <PersonalMark />}
                </div>
                <button
                  type="button"
                  className="import-btn import-btn-danger import-btn-small"
                  aria-label={`刪除個人資料第 ${n} 列`}
                  onClick={() => onRemove(i)}
                >
                  刪除
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button type="button" className="import-btn import-btn-secondary" onClick={onAdd}>
        新增個人資料欄位
      </button>
    </section>
  );
}
