import type { ProjectSuggestionFailure } from '@rolecraft/contracts';

import {
  documentsOf,
  moveDocument,
  renameGroup,
  toggleGroup,
  type GroupingDraft,
} from './grouping-model.ts';
import { useProjectSuggestion } from './useProjectSuggestion.ts';

const FAILURE_TEXT: Record<ProjectSuggestionFailure, string> = {
  run_check_failed: '訂閱路線確認沒有通過（請到設定頁重新檢查服務）',
  provider_error: 'AI 服務回報錯誤',
  invalid_output: 'AI 回覆的分組格式不合格，整份不採用',
  quota_exhausted: '額度用完',
  cancelled: '已取消',
};

const UNGROUPED = '';

function DraftEditor(props: {
  draft: GroupingDraft;
  busy: boolean;
  onChange: (draft: GroupingDraft) => void;
}) {
  const { draft, busy, onChange } = props;
  const sections = [
    ...draft.groups.map((g) => ({ key: g.key, group: g })),
    { key: null, group: null },
  ];
  return (
    <div className="grouping-draft">
      {sections.map(({ key, group }) => (
        <fieldset key={key ?? UNGROUPED} aria-label={group ? `建議組 ${group.key}` : '未分組'}>
          {group ? (
            <legend>
              <label>
                <input
                  type="checkbox"
                  checked={group.included}
                  disabled={busy}
                  onChange={(e) => onChange(toggleGroup(draft, group.key, e.target.checked))}
                />
                建立這組
              </label>{' '}
              <label>
                專案名稱
                <input
                  value={group.name}
                  maxLength={100}
                  disabled={busy}
                  onChange={(e) => onChange(renameGroup(draft, group.key, e.target.value))}
                />
              </label>
            </legend>
          ) : (
            <legend>未分組（不屬任何專案）</legend>
          )}
          <ul>
            {documentsOf(draft, key).map((doc) => (
              <li key={doc.sourceDocumentId}>
                {doc.name}{' '}
                <select
                  aria-label={`${doc.name} 移到`}
                  value={key ?? UNGROUPED}
                  disabled={busy}
                  onChange={(e) =>
                    onChange(
                      moveDocument(
                        draft,
                        doc.sourceDocumentId,
                        e.target.value === UNGROUPED ? null : e.target.value,
                      ),
                    )
                  }
                >
                  {draft.groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.name.trim() === '' ? '（未命名）' : g.name}
                    </option>
                  ))}
                  <option value={UNGROUPED}>未分組</option>
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

/**
 * 「建議專案分組」（D23、P1-T063）：AI 依文件摘要提出分組建議；使用者可改名、取消某組、
 * 把文件移到別組，按「確認建立」才建立專案。只送摘要與相對檔名，不送原文。
 */
export function ProjectGrouping() {
  const s = useProjectSuggestion();
  const running = s.view?.state === 'running';
  return (
    <section aria-labelledby="grouping-title">
      <h2 id="grouping-title">專案分組</h2>
      <p>
        讓 AI 依已分析文件的摘要建議怎麼分專案（只送摘要與檔名，不送原文）。建議不會自動建立專案，
        你確認後才建立；已屬於專案的文件不會再列入。之後重新分析時，新事實項會自動歸入其文件所屬專案。
      </p>
      <button type="button" disabled={s.busy || running} onClick={() => void s.suggest()}>
        {running ? '建議中…' : '建議專案分組'}
      </button>
      {s.notice && <p role="status">{s.notice}</p>}
      {s.view?.state === 'failed' && s.view.failure ? (
        <p role="alert">未能取得建議：{FAILURE_TEXT[s.view.failure]}。</p>
      ) : null}
      {s.draft ? (
        <>
          <DraftEditor draft={s.draft} busy={s.busy} onChange={s.setDraft} />
          <button type="button" disabled={s.busy} onClick={() => void s.confirm()}>
            確認建立
          </button>{' '}
          <button type="button" disabled={s.busy} onClick={s.discard}>
            放棄這次建議
          </button>
        </>
      ) : null}
    </section>
  );
}
