import './components/import-form.css';
import { ExperienceCard } from './components/ExperienceCard.tsx';
import { InfoRows } from './components/InfoRows.tsx';
import { SkillChips } from './components/SkillChips.tsx';
import {
  EMPTY_EXPERIENCE,
  type ExperienceKey,
  type ExperienceRow,
  type FieldOrigin,
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

/** 使用者改過的欄位不再標黃（D29）；出處照留。 */
function unflag<T extends FieldOrigin | null | undefined>(origin: T): T {
  return origin?.flag ? ({ ...origin, flag: null } as FieldOrigin as T) : origin;
}

const EDIT_KEYS: readonly ExperienceKey[] = [
  'company',
  'title',
  'startDate',
  'endDate',
  'description',
];

/** 經歷改了哪幾欄就取消那幾欄的標黃；勾選「至今」算改了結束日期。 */
function touchExperience(prev: ExperienceRow, next: ExperienceRow): ExperienceRow {
  if (!next.origins) return next;
  const origins = { ...next.origins };
  for (const key of EDIT_KEYS) {
    const changed = prev[key] !== next[key] || (key === 'endDate' && prev.current !== next.current);
    if (changed && origins[key]) origins[key] = unflag(origins[key]);
  }
  return { ...next, origins };
}

/** 逐欄校正表單：個人資料、經歷、技能都可改、可增刪。 */
export function ProfileFormFields({ form, onChange, disabled = false }: ProfileFormProps) {
  // 技能的個資標示與 skills 同索引；沒有標示時補成同長度的 false
  const personalSkills = form.skills.map((_, i) => form.personalSkills?.[i] === true);
  // 技能的出處與 skills 同索引（D29）；沒有時補成同長度的 null
  const skillOrigins = form.skills.map((_, i) => form.skillOrigins?.[i] ?? null);
  return (
    <fieldset disabled={disabled} className="profile-form import-form">
      <legend className="import-visually-hidden">校正內容</legend>

      <InfoRows
        rows={form.info}
        onChange={(i, row) =>
          onChange({
            ...form,
            info: replaceAt(form.info, i, { ...row, origin: unflag(row.origin) }),
          })
        }
        onRemove={(i) => onChange({ ...form, info: removeAt(form.info, i) })}
        onAdd={() => onChange({ ...form, info: [...form.info, { label: '', value: '' }] })}
      />

      <section className="import-section" aria-label="經歷">
        <h3 className="import-section-title">經歷</h3>
        {form.experiences.length === 0 && (
          <p className="placeholder-note">尚無經歷，可按下方新增。</p>
        )}
        {form.experiences.map((row, i) => (
          <ExperienceCard
            key={i}
            row={row}
            index={i}
            onChange={(next) =>
              onChange({
                ...form,
                experiences: replaceAt(form.experiences, i, touchExperience(row, next)),
              })
            }
            onRemove={() => onChange({ ...form, experiences: removeAt(form.experiences, i) })}
          />
        ))}
        <button
          type="button"
          className="import-btn import-btn-secondary"
          onClick={() =>
            onChange({ ...form, experiences: [...form.experiences, { ...EMPTY_EXPERIENCE }] })
          }
        >
          新增一段經歷
        </button>
      </section>

      <SkillChips
        skills={form.skills}
        personal={personalSkills}
        origins={skillOrigins}
        onChange={(i, value) =>
          onChange({
            ...form,
            skills: replaceAt(form.skills, i, value),
            skillOrigins: replaceAt(skillOrigins, i, unflag(skillOrigins[i] ?? null)),
          })
        }
        onRemove={(i) =>
          onChange({
            ...form,
            skills: removeAt(form.skills, i),
            personalSkills: removeAt(personalSkills, i),
            skillOrigins: removeAt(skillOrigins, i),
          })
        }
        onAdd={() =>
          onChange({
            ...form,
            skills: [...form.skills, ''],
            personalSkills: [...personalSkills, false],
            skillOrigins: [...skillOrigins, null],
          })
        }
      />
    </fieldset>
  );
}
