import type { ExperienceRow, ProfileForm } from '../form-model.ts';

const orBlank = (value: string): string => (value.trim() === '' ? '未填' : value.trim());

/** 期間：開始～結束（勾「至今」顯示至今）。 */
function period(e: ExperienceRow): string {
  const end = e.current ? '至今' : orBlank(e.endDate);
  return `${orBlank(e.startDate)} ~ ${end}`;
}

/**
 * 確認前的精簡摘要（D29，擁有者 2026-10-13 再裁定）：每段經歷一行「公司｜職稱｜期間」、學歷一行。
 * 預設收合、可展開，不需勾選；只是給使用者掃一眼，不擋確認。
 */
export function ConfirmSummary({ form }: { form: ProfileForm }) {
  const education = form.info.find((row) => row.label.trim() === '學歷')?.value.trim() ?? '';
  return (
    <details className="import-summary">
      <summary>內容摘要（{form.experiences.length} 段經歷）</summary>
      <ul aria-label="內容摘要">
        {form.experiences.map((e, i) => (
          <li key={i}>
            {orBlank(e.company)}｜{orBlank(e.title)}｜{period(e)}
          </li>
        ))}
        <li>學歷：{education === '' ? '未填' : education.replace(/\s*\n\s*/gu, '；')}</li>
      </ul>
    </details>
  );
}
