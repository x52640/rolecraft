import './profile-page.css';

import { useEffect } from 'react';

import { hrefFor } from '../../app/router.ts';
import { ExperienceEditor } from './components/ExperienceEditor.tsx';
import { InfoEditor } from './components/InfoEditor.tsx';
import { SaveBar } from './components/SaveBar.tsx';
import { SkillEditor } from './components/SkillEditor.tsx';
import { isDirty, unmatchedExperiences } from './profile-model.ts';
import { PROFILE_PAGE_TEXT } from './profile-text.ts';
import { useProfileEditor } from './useProfileEditor.ts';

/** 有未存修改時，關閉或重新整理分頁前請瀏覽器先確認。 */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [active]);
}

/**
 * 個人資料頁（D30；resume-import「個人資料編輯（D30）」）：唯一那份已確認 Profile 的逐欄修改、刪除、新增，
 * 每欄顯示出處原文。按儲存才寫入（儲存即使用者確認，D4）；不呼叫模型。
 */
export function ProfilePage() {
  const s = useProfileEditor();
  const { view, form } = s;
  const ready = view.kind === 'ready' && form !== null ? { base: view.base, form } : null;
  const dirty = ready !== null && isDirty(ready.base, ready.form);
  const locked = s.busy !== null;
  useLeaveGuard(dirty);

  return (
    <section aria-labelledby="page-title" className="pf-page">
      <h1 id="page-title">個人資料</h1>
      <p className="pf-hint">
        這裡是匯入確認後的個人資料。修改後按「儲存」才會寫入；每欄旁是匯入時的出處原文。
      </p>
      {s.failure ? (
        <p role="alert" className="pf-warning">
          {s.failure}
        </p>
      ) : null}
      {s.notice ? (
        <p role="status" className="pf-notice">
          {s.notice}
        </p>
      ) : null}
      {view.kind === 'loading' ? <p>讀取中…</p> : null}
      {view.kind === 'none' ? (
        <p>
          {PROFILE_PAGE_TEXT.missing} <a href={hrefFor('import')}>到匯入頁</a>
        </p>
      ) : null}
      {view.kind === 'blocked' ? (
        <div>
          <p role="note" aria-label="無法編輯的原因">
            {view.message}
          </p>
          <button type="button" disabled={locked} onClick={() => void s.reload()}>
            重新讀取
          </button>
        </div>
      ) : null}
      {ready ? (
        <>
          <fieldset disabled={locked} className="pf-form">
            <legend className="pf-hidden">編輯個人資料</legend>
            <InfoEditor
              base={ready.base}
              rows={ready.form.info}
              onChange={(info) => s.edit({ ...ready.form, info })}
            />
            <ExperienceEditor
              base={ready.base}
              rows={ready.form.experiences}
              onChange={(experiences) => s.edit({ ...ready.form, experiences })}
            />
            <SkillEditor
              base={ready.base}
              rows={ready.form.skills}
              onChange={(skills) => s.edit({ ...ready.form, skills })}
            />
          </fieldset>
          <SaveBar
            dirty={dirty}
            locked={locked}
            saving={s.busy === 'saving'}
            editVersion={s.editVersion}
            unmatched={unmatchedExperiences(ready.base, ready.form)}
            onSave={() => void s.save()}
            onReload={() => void s.reload()}
          />
        </>
      ) : null}
    </section>
  );
}
