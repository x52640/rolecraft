import {
  EMPTY_EXPERIENCE,
  type ExperienceRow,
  type InfoRow,
  type ProfileForm,
} from './form-model.ts';

interface ProfileFormProps {
  form: ProfileForm;
  onChange: (form: ProfileForm) => void;
  disabled?: boolean;
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((old, i) => (i === index ? item : old));
}

function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function ExperienceFields(props: {
  row: ExperienceRow;
  index: number;
  onChange: (row: ExperienceRow) => void;
  onRemove: () => void;
}) {
  const { row, index, onChange, onRemove } = props;
  const n = String(index + 1);
  const text = (key: 'company' | 'title' | 'startDate' | 'endDate', label: string) => (
    <label>
      {label}
      <input
        aria-label={`第 ${n} 段經歷${label}`}
        value={row[key]}
        disabled={key === 'endDate' && row.current}
        onChange={(e) => onChange({ ...row, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <fieldset>
      <legend>第 {n} 段經歷</legend>
      {text('company', '公司')}
      {text('title', '職稱')}
      {text('startDate', '開始日期')}
      {text('endDate', '結束日期')}
      <label>
        <input
          type="checkbox"
          aria-label={`第 ${n} 段經歷至今`}
          checked={row.current}
          onChange={(e) => onChange({ ...row, current: e.target.checked })}
        />
        至今
      </label>
      <label>
        描述
        <textarea
          aria-label={`第 ${n} 段經歷描述`}
          value={row.description}
          onChange={(e) => onChange({ ...row, description: e.target.value })}
        />
      </label>
      <button type="button" onClick={onRemove}>
        刪除這段經歷
      </button>
    </fieldset>
  );
}

/** 逐欄校正表單：個人資料、經歷、技能都可改、可增刪。 */
export function ProfileFormFields({ form, onChange, disabled = false }: ProfileFormProps) {
  const setInfo = (index: number, row: InfoRow) =>
    onChange({ ...form, info: replaceAt(form.info, index, row) });
  return (
    <fieldset disabled={disabled} className="profile-form">
      <legend>校正內容</legend>

      <h3>個人資料</h3>
      {form.info.map((row, i) => (
        <div key={i}>
          <input
            aria-label={`個人資料第 ${String(i + 1)} 列名稱`}
            value={row.label}
            onChange={(e) => setInfo(i, { ...row, label: e.target.value })}
          />
          <input
            aria-label={row.label.trim() === '' ? `個人資料第 ${String(i + 1)} 列` : row.label}
            value={row.value}
            onChange={(e) => setInfo(i, { ...row, value: e.target.value })}
          />
          <button type="button" onClick={() => onChange({ ...form, info: removeAt(form.info, i) })}>
            刪除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...form, info: [...form.info, { label: '', value: '' }] })}
      >
        新增個人資料欄位
      </button>

      <h3>經歷</h3>
      {form.experiences.map((row, i) => (
        <ExperienceFields
          key={i}
          row={row}
          index={i}
          onChange={(next) =>
            onChange({ ...form, experiences: replaceAt(form.experiences, i, next) })
          }
          onRemove={() => onChange({ ...form, experiences: removeAt(form.experiences, i) })}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({ ...form, experiences: [...form.experiences, { ...EMPTY_EXPERIENCE }] })
        }
      >
        新增一段經歷
      </button>

      <h3>技能</h3>
      {form.skills.map((skill, i) => (
        <div key={i}>
          <input
            aria-label={`技能 ${String(i + 1)}`}
            value={skill}
            onChange={(e) =>
              onChange({ ...form, skills: replaceAt(form.skills, i, e.target.value) })
            }
          />
          <button
            type="button"
            onClick={() => onChange({ ...form, skills: removeAt(form.skills, i) })}
          >
            刪除
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...form, skills: [...form.skills, ''] })}>
        新增技能
      </button>
    </fieldset>
  );
}
