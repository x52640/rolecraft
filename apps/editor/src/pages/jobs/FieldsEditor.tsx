import { useId } from 'react';

import {
  OPTIONAL_KEYS,
  type DraftErrors,
  type EmptyStatus,
  type JobFieldsDraft,
  type OptionalKey,
  type RequiredKey,
} from './draft.ts';
import {
  EMPTY_STATUS_HINTS,
  EMPTY_STATUS_LABELS,
  OPTIONAL_FIELD_LABELS,
  REQUIRED_FIELD_LABELS,
} from './labels.ts';

interface FieldsEditorProps {
  draft: JobFieldsDraft;
  onChange: (draft: JobFieldsDraft) => void;
  errors?: DraftErrors;
  disabled?: boolean;
}

/** 必要欄位一欄。內容一律當純文字顯示與編輯（D6）。 */
function RequiredField(props: FieldsEditorProps & { name: RequiredKey; multiline?: boolean }) {
  const { name, draft, onChange, errors, disabled, multiline } = props;
  const id = useId();
  const error = errors?.[name];
  const common = {
    id,
    value: draft[name],
    disabled,
    required: true,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (e: { target: { value: string } }) => onChange({ ...draft, [name]: e.target.value }),
  };
  return (
    <div className="job-field">
      <label htmlFor={id}>{REQUIRED_FIELD_LABELS[name]}（必填）</label>
      {multiline ? <textarea rows={10} {...common} /> : <input type="text" {...common} />}
      {error ? (
        <p id={`${id}-error`} className="job-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 選用欄位一欄：有內容就是內容；空白時要選「未擷取到」或「頁面未提供」（R10）。 */
function OptionalField(props: FieldsEditorProps & { name: OptionalKey }) {
  const { name, draft, onChange, disabled } = props;
  const id = useId();
  const field = draft[name];
  const blank = !/\S/u.test(field.value);
  const label = OPTIONAL_FIELD_LABELS[name];
  const set = (next: Partial<typeof field>) =>
    onChange({ ...draft, [name]: { ...field, ...next } });
  return (
    <div className="job-field">
      <label htmlFor={id}>{label}</label>
      {blank ? (
        <span className={`job-badge job-badge-${field.emptyStatus}`} data-testid={`status-${name}`}>
          {EMPTY_STATUS_LABELS[field.emptyStatus]}
        </span>
      ) : null}
      <textarea
        id={id}
        rows={3}
        value={field.value}
        disabled={disabled}
        onChange={(e) => set({ value: e.target.value })}
      />
      {blank ? (
        <label className="job-empty-status">
          空白時標示為{' '}
          <select
            aria-label={`${label}空白時的標示`}
            value={field.emptyStatus}
            disabled={disabled}
            onChange={(e) => set({ emptyStatus: e.target.value as EmptyStatus })}
          >
            {(['not_captured', 'not_provided'] as const).map((status) => (
              <option key={status} value={status}>
                {EMPTY_STATUS_LABELS[status]}（{EMPTY_STATUS_HINTS[status]}）
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

/** 職缺欄位表單：手動貼上與修改快照共用。 */
export function FieldsEditor(props: FieldsEditorProps) {
  return (
    <fieldset className="job-fields" disabled={props.disabled}>
      <legend>職缺內容</legend>
      <RequiredField {...props} name="company" />
      <RequiredField {...props} name="title" />
      <RequiredField {...props} name="description" multiline />
      {OPTIONAL_KEYS.map((name) => (
        <OptionalField key={name} {...props} name={name} />
      ))}
    </fieldset>
  );
}
