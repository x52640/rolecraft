import type { ImportDraft, ImportDraftField, ImportResult } from '@rolecraft/contracts';

type Parsed = Extract<ImportResult, { status: 'parsed' }>;

const DRAFT_GROUPS: readonly [keyof Omit<ImportDraft, 'name'>, string][] = [
  ['dates', '日期'],
  ['companies', '公司'],
  ['titles', '職稱'],
  ['skills', '技能'],
];

const where = (field: ImportDraftField): string =>
  `第 ${String(field.pageNumber)} 頁第 ${String(field.lineIndex + 1)} 行`;

function DraftList({ label, fields }: { label: string; fields: readonly ImportDraftField[] }) {
  return (
    <div className="import-draft-group">
      <h4>{label}</h4>
      {fields.length === 0 ? (
        <p className="placeholder-note">沒找到</p>
      ) : (
        <ul aria-label={`偵測到的${label}`}>
          {fields.map((field) => (
            <li key={`${where(field)}-${field.value}`}>
              {field.value} <small className="placeholder-note">（{where(field)}）</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 解析預覽：原文（依頁分組、淡色行號、可捲動）與偵測到的欄位（全部未確認，附出處）。 */
export function ParsePreview({ result }: { result: Parsed }) {
  return (
    <section aria-label="解析預覽" className="import-source">
      <h2 className="import-section-title">PDF 原文</h2>
      <p className="import-hint">左邊欄位都是自動猜的、尚未確認；請對照這裡的原文逐欄校正。</p>
      {result.pagesWithoutText.length > 0 && (
        <p role="note" className="import-warning">
          第 {result.pagesWithoutText.join('、')} 頁沒有文字（可能是圖片），內容請自行補到表單。
        </p>
      )}
      <div className="import-source-scroll" tabIndex={0} role="group" aria-label="原文內容">
        {result.pages.map((page) => (
          <div key={page.pageNumber} className="import-source-page">
            <h3>第 {page.pageNumber} 頁</h3>
            <ol aria-label={`第 ${String(page.pageNumber)} 頁原文`} className="import-lines">
              {page.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <details className="import-draft">
        <summary>偵測到的欄位（未確認）</summary>
        <DraftList label="姓名" fields={result.draft.name ? [result.draft.name] : []} />
        {DRAFT_GROUPS.map(([key, label]) => (
          <DraftList key={key} label={label} fields={result.draft[key]} />
        ))}
      </details>
    </section>
  );
}
