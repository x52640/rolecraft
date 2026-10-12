import './components/import-form.css';
import { ExperienceCard } from './components/ExperienceCard.tsx';
import { InfoRows } from './components/InfoRows.tsx';
import { SkillChips } from './components/SkillChips.tsx';
import { EMPTY_EXPERIENCE, type ProfileForm } from './form-model.ts';

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

/** 逐欄校正表單：個人資料、經歷、技能都可改、可增刪。 */
export function ProfileFormFields({ form, onChange, disabled = false }: ProfileFormProps) {
  // 技能的個資標示與 skills 同索引；沒有標示時補成同長度的 false
  const personalSkills = form.skills.map((_, i) => form.personalSkills?.[i] === true);
  return (
    <fieldset disabled={disabled} className="profile-form import-form">
      <legend className="import-visually-hidden">校正內容</legend>

      <InfoRows
        rows={form.info}
        onChange={(i, row) => onChange({ ...form, info: replaceAt(form.info, i, row) })}
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
              onChange({ ...form, experiences: replaceAt(form.experiences, i, next) })
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
        onChange={(i, value) => onChange({ ...form, skills: replaceAt(form.skills, i, value) })}
        onRemove={(i) =>
          onChange({
            ...form,
            skills: removeAt(form.skills, i),
            personalSkills: removeAt(personalSkills, i),
          })
        }
        onAdd={() =>
          onChange({
            ...form,
            skills: [...form.skills, ''],
            personalSkills: [...personalSkills, false],
          })
        }
      />
    </fieldset>
  );
}
