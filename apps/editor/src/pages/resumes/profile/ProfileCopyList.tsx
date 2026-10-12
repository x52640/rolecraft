import { PROFILE_TEXT, profileGroups } from './profile-labels.ts';
import type { ProfileState } from './useProfileCopy.ts';

interface Props {
  readonly state: ProfileState;
  readonly locked: boolean;
  readonly onCopy: (key: string) => void;
}

/** 已確認個人資料的各欄與「複製」按鈕（P1-T085）；沒有或多份 Profile 時顯示原因。 */
export function ProfileCopyList({ state, locked, onCopy }: Props) {
  if (state.kind === 'loading') return <p>讀取個人資料中…</p>;
  if (state.kind === 'none') return <p className="resume-hint">{PROFILE_TEXT.none}</p>;
  if (state.kind === 'blocked') return <p className="resume-hint">{state.message}</p>;
  return (
    <>
      {profileGroups(state.profile).map((group) => (
        <div key={group.key} className="profile-group">
          <h3>{group.title}</h3>
          {group.items.length === 0 ? <p className="resume-hint">沒有任何欄位。</p> : null}
          <dl>
            {group.items.map((item) => (
              <div key={item.key} className="profile-item">
                <dt>{item.label}</dt>
                <dd>
                  {item.value === '' ? <span className="resume-hint">（空白）</span> : item.value}
                </dd>
                <dd>
                  <button
                    type="button"
                    aria-label={`複製${group.title}的${item.label}`}
                    disabled={locked || item.value === ''}
                    onClick={() => onCopy(item.key)}
                  >
                    複製
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}
