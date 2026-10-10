import type { ApplicationInitiation, ExportVersionSummary } from '@rolecraft/contracts';
import { useId, useState, type FormEvent } from 'react';

import {
  INITIATION_LABELS,
  STATUS_SUGGESTIONS,
  dateToTimestamp,
  labelFor,
  versionLabel,
} from './model.ts';
import type { ApplicationFields } from './useApplications.ts';

export interface ApplicationFormValues {
  initiation: ApplicationInitiation;
  /** 當地日期 YYYY-MM-DD */
  date: string;
  status: string;
  exportVersionId: string;
}

interface ApplicationFormProps {
  /** 名稱，用於表單的無障礙標籤 */
  name: string;
  initial: ApplicationFormValues;
  /** 可選的匯出版本：實際投出只能從這裡選（R3） */
  versions: readonly ExportVersionSummary[];
  /** 修改既有紀錄：實際投出版本不能改，只顯示 */
  versionLocked?: boolean;
  submitLabel: string;
  onSubmit: (fields: ApplicationFields) => Promise<string | null>;
  onCancel?: () => void;
}

/** 投遞紀錄表單：起因、日期、狀態、實際投出的匯出版本。只是記錄，不會投遞（D7）。 */
export function ApplicationForm(props: ApplicationFormProps) {
  const { name, initial, versions, versionLocked = false, submitLabel, onCancel } = props;
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const set = (patch: Partial<ApplicationFormValues>) => setValues((v) => ({ ...v, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const appliedAt = dateToTimestamp(values.date);
    if (!appliedAt) return setError('請填投遞日期');
    if (!/\S/u.test(values.status)) return setError('請填狀態');
    const known = versions.some((v) => v.exportVersionId === values.exportVersionId);
    if (!versionLocked && !known) return setError('請選實際投出的匯出版本');
    setBusy(true);
    setError(null);
    const message = await props.onSubmit({
      initiation: values.initiation,
      appliedAt,
      status: values.status,
      exportVersionId: values.exportVersionId,
    });
    setBusy(false);
    setError(message);
  }

  return (
    <form aria-label={name} onSubmit={(e) => void submit(e)}>
      <fieldset>
        <legend>起因</legend>
        {(Object.keys(INITIATION_LABELS) as ApplicationInitiation[]).map((key) => (
          <label key={key}>
            <input
              type="radio"
              name={`${id}-initiation`}
              checked={values.initiation === key}
              onChange={() => set({ initiation: key })}
            />
            {INITIATION_LABELS[key]}
          </label>
        ))}
      </fieldset>
      <label>
        投遞日期
        <input
          type="date"
          required
          value={values.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </label>
      <label>
        狀態
        <input
          list={`${id}-status`}
          required
          value={values.status}
          onChange={(e) => set({ status: e.target.value })}
        />
      </label>
      <datalist id={`${id}-status`}>
        {STATUS_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {versionLocked ? (
        <p>
          實際投出版本：{labelFor(values.exportVersionId, versions)}
          （建立後不能更改；投錯版本請刪除這筆後重新新增）
        </p>
      ) : (
        <label>
          實際投出版本
          <select
            required
            value={values.exportVersionId}
            onChange={(e) => set({ exportVersionId: e.target.value })}
          >
            <option value="">請選匯出版本</option>
            {versions.map((v) => (
              <option key={v.exportVersionId} value={v.exportVersionId}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      )}
    </form>
  );
}
