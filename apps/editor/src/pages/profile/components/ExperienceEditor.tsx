import {
  baseExperienceValue,
  emptyExperience,
  experienceSource,
  experienceValue,
  type ExperienceKey,
  type ExperienceRow,
  type ProfileBase,
} from '../profile-model.ts';
import { PROFILE_PAGE_TEXT } from '../profile-text.ts';
import { SourceNote } from './SourceNote.tsx';

interface ExperienceEditorProps {
  base: ProfileBase;
  rows: readonly ExperienceRow[];
  onChange: (rows: ExperienceRow[]) => void;
}

const LINE_FIELDS: readonly { key: 'company' | 'title' | 'startDate'; label: string }[] = [
  { key: 'company', label: '公司' },
  { key: 'title', label: '職稱' },
  { key: 'startDate', label: '開始' },
];

function Note({
  base,
  row,
  field,
}: {
  base: ProfileBase;
  row: ExperienceRow;
  field: ExperienceKey;
}) {
  const old = baseExperienceValue(base, row.from, field);
  return (
    <SourceNote
      source={experienceSource(base, row.from, field)}
      added={row.from === null}
      changed={old !== null && old !== experienceValue(row, field)}
    />
  );
}

/** 一段經歷：公司、職稱、開始、結束（或至今）、描述，每欄旁顯示出處。 */
function ExperienceCard(props: {
  base: ProfileBase;
  row: ExperienceRow;
  n: string;
  onChange: (row: ExperienceRow) => void;
  onRemove: () => void;
}) {
  const { base, row, n, onChange, onRemove } = props;
  return (
    <fieldset className="pf-card">
      <legend>經歷 {n}</legend>
      {LINE_FIELDS.map(({ key, label }) => (
        <div className="pf-field" key={key}>
          <span>{label}</span>
          <input
            aria-label={`經歷 ${n} ${label}`}
            value={row[key]}
            onChange={(e) => onChange({ ...row, [key]: e.target.value })}
          />
          <Note base={base} row={row} field={key} />
        </div>
      ))}
      <div className="pf-field">
        <span>結束</span>
        <input
          aria-label={`經歷 ${n} 結束`}
          value={row.current ? '' : row.endDate}
          disabled={row.current}
          onChange={(e) => onChange({ ...row, endDate: e.target.value })}
        />
        <label>
          <input
            type="checkbox"
            aria-label={`經歷 ${n} 至今`}
            checked={row.current}
            onChange={(e) => onChange({ ...row, current: e.target.checked })}
          />
          至今
        </label>
        <Note base={base} row={row} field="endDate" />
      </div>
      <div className="pf-field">
        <span>描述</span>
        <textarea
          aria-label={`經歷 ${n} 描述`}
          rows={3}
          value={row.description}
          onChange={(e) => onChange({ ...row, description: e.target.value })}
        />
        <Note base={base} row={row} field="description" />
      </div>
      <button type="button" className="pf-remove" onClick={onRemove}>
        刪除經歷 {n}
      </button>
    </fieldset>
  );
}

/** 經歷：逐欄修改、刪除整段、新增一段。刪除不刪任何已匯出版本或 PDF（D30 (b)）。 */
export function ExperienceEditor({ base, rows, onChange }: ExperienceEditorProps) {
  return (
    <section className="pf-section" aria-label="經歷">
      <h2>經歷</h2>
      <p className="pf-hint">{PROFILE_PAGE_TEXT.removeKeepsPdf}</p>
      {rows.length === 0 ? <p className="placeholder-note">沒有經歷，可按下方新增。</p> : null}
      {rows.map((row, i) => (
        <ExperienceCard
          key={row.key}
          base={base}
          row={row}
          n={String(i + 1)}
          onChange={(next) => onChange(rows.map((r, j) => (j === i ? next : r)))}
          onRemove={() => onChange(rows.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="pf-add"
        onClick={() => onChange([...rows, emptyExperience()])}
      >
        新增一段經歷
      </button>
    </section>
  );
}
