import { ProfilePhotoPanel } from './profile/ProfilePhotoPanel.tsx';
import { SectionCard } from './SectionCard.tsx';
import { SectionEditor } from './SectionEditor.tsx';
import { StaleNotice } from './stale/StaleNotice.tsx';
import type { ResumePollOptions } from './useGenerateResume.ts';
import {
  EDITING_BLOCKS_GENERATE_TEXT,
  useResumeEditor,
  type ResumeEditor,
  type VersionView,
} from './useResumeEditor.ts';
import './resumes.css';

function ExportStatus({ view }: { view: VersionView }) {
  const { check } = view;
  if (check === null) return <p role="status">無法取得匯出前檢查結果。</p>;
  if (check.ready) {
    return <p role="status">匯出前檢查通過：每段都已把關，可以匯出。</p>;
  }
  const sections = new Set([...check.issues, ...check.blockers].map((x) => x.sectionId));
  return (
    <p role="status" className="resume-warning">
      還不能匯出：{String(sections.size)}{' '}
      段有待處理的問題（見各段）。處理方式：改寫、刪除整段、到事實項確認，或（只限數字出處與沒有引用的問題）逐段確認。
    </p>
  );
}

function Sections({ editor, view }: { editor: ResumeEditor; view: VersionView }) {
  const { editing, setEditing } = editor;
  const { version, check } = view;
  if (version.sections.length === 0) return <p>這個版本沒有任何段落。</p>;
  return (
    <>
      {version.sections.map((section) =>
        editing === section.id ? (
          <SectionEditor
            key={section.id}
            section={section}
            claims={view.claims}
            allClaims={editor.allClaims}
            busy={editor.busy}
            onLoadClaims={() => void editor.loadAllClaims()}
            onCancel={() => setEditing(null)}
            onSave={(text, citations, ack) =>
              void editor.edit(section.id, text, citations, ack).then((ok) => {
                if (ok) setEditing(null);
              })
            }
          />
        ) : (
          <SectionCard
            key={section.id}
            section={section}
            original={view.originals.find((o) => o.sectionId === section.id)?.text ?? null}
            claims={view.claims}
            issues={check?.issues.filter((i) => i.sectionId === section.id) ?? []}
            blockers={check?.blockers.filter((b) => b.sectionId === section.id) ?? []}
            busy={editor.busy}
            onAccept={() => void editor.accept(section.id)}
            onReject={() => void editor.reject(section.id)}
            onEdit={() => setEditing(section.id)}
            onDelete={() => void editor.remove(section.id)}
            onConfirm={() => void editor.confirm(section.id, section.text)}
          />
        ),
      )}
    </>
  );
}

/**
 * 履歷頁（F07、R1）：針對職缺逐段對照修改稿，接受、退回、改寫，匯出前檢查不過不能匯出。
 * 產生後自動輪詢並顯示新版本（P1-T072）；poll 只給測試調整。
 */
export function ResumesPage({ poll }: { readonly poll?: ResumePollOptions }) {
  const editor = useResumeEditor(poll);
  const job = editor.jobs?.find((j) => j.id === editor.jobId);

  return (
    <section aria-labelledby="page-title" className="resumes-page">
      <h1 id="page-title">履歷</h1>
      <p>
        對照原文逐段把關修改稿。接受只代表接受措辭，不會確認任何事實項；寫成「已完成」的內容必須先在事實項頁確認完成。
      </p>
      {editor.notice ? (
        <p role="note" className="resume-notice">
          {editor.notice}
        </p>
      ) : null}
      {editor.jobs === null ? <p>讀取職缺中…</p> : null}
      {editor.jobs?.length === 0 ? <p>還沒有職缺，請先到職缺頁新增並確認。</p> : null}
      {editor.jobs && editor.jobs.length > 0 ? (
        <div className="resume-toolbar">
          <label>
            職缺
            <select
              value={editor.jobId ?? ''}
              disabled={editor.busy}
              onChange={(e) => editor.setJobId(e.target.value)}
            >
              {editor.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company}｜{j.title}
                  {j.confirmedAt === null ? '（未確認）' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={
              editor.busy ||
              editor.waiting ||
              editor.editing !== null ||
              !job ||
              job.confirmedAt === null
            }
            onClick={() => void editor.generate()}
          >
            {editor.sending ? '送出中…' : editor.waiting ? '等待新版本…' : '產生客製履歷'}
          </button>
          {editor.waiting ? (
            <button type="button" onClick={editor.stopWaiting}>
              停止等待
            </button>
          ) : null}
          <button type="button" disabled={editor.busy} onClick={() => void editor.refresh()}>
            重新整理
          </button>
          {editor.versions && editor.versions.length > 0 ? (
            <label>
              版本
              <select
                value={editor.versionId ?? ''}
                onChange={(e) => editor.setVersionId(e.target.value)}
              >
                {editor.versions.map((v) => (
                  <option key={v.resumeVersionId} value={v.resumeVersionId}>
                    {v.createdAt}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {editor.editing !== null ? (
        <p className="resume-hint">{EDITING_BLOCKS_GENERATE_TEXT}</p>
      ) : null}
      {job && job.confirmedAt === null ? (
        <p className="resume-hint">這個職缺快照尚未確認，確認後才能產生履歷。</p>
      ) : null}
      {editor.versions?.length === 0 ? <p>這個職缺還沒有履歷版本。</p> : null}
      {editor.view ? (
        <>
          <StaleNotice key={editor.view.version.id} version={editor.view.version} />
          <ExportStatus view={editor.view} />
          <Sections key={editor.view.version.id} editor={editor} view={editor.view} />
        </>
      ) : null}
      <ProfilePhotoPanel />
    </section>
  );
}
