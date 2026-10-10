// 校正表單的資料模型：欄位草稿 → 表單初值；表單 → 送給 helper 的 ProfileInput（含檢查）。
// 草稿只是預填，一律未確認；找不到的欄位留空，不捏造（F02、R10）。
import {
  ProfileInput,
  type ImportDraft,
  type ImportDraftField,
  type ResumeImportFailureReason,
} from '@rolecraft/contracts';

export interface InfoRow {
  label: string;
  value: string;
}

export interface ExperienceRow {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  /** 至今（勾選時 endDate 不用填） */
  current: boolean;
  description: string;
}

export interface ProfileForm {
  info: InfoRow[];
  experiences: ExperienceRow[];
  skills: string[];
}

export const EMPTY_EXPERIENCE: ExperienceRow = {
  company: '',
  title: '',
  startDate: '',
  endDate: '',
  current: false,
  description: '',
};

/** 手動輸入（D18）的空白表單。 */
export function emptyForm(): ProfileForm {
  return { info: [{ label: '姓名', value: '' }], experiences: [], skills: [] };
}

/** 解析失敗原因 → 給人看的說明。 */
export const FAILURE_TEXT: Record<ResumeImportFailureReason, string> = {
  invalid_pdf: '這個檔案不是 PDF，或檔案已損壞，無法讀取。',
  encrypted: '這份 PDF 有密碼保護，無法讀取。',
  no_text_layer: '這份 PDF 沒有文字層（可能是掃描檔或圖片），首版不做文字辨識。',
  garbled_text: '擷取出的文字亂碼過多（可能是字型對應問題），結果不可靠。',
  reading_order_unreliable: '文字重疊或旋轉，讀取順序不可靠。',
};

const CURRENT = /^(至今|迄今|現在|present|now|current)$/iu;
const DATE = String.raw`(?:19|20)\d{2}(?:\s*[./\-年]\s*\d{1,2}\s*月?)?`;
const RANGE = new RegExp(String.raw`^(${DATE})\s*(?:~|～|-|–|—|至|to)\s*(.+)$`, 'iu');

/** 「2020/01 ~ Present」拆成起訖；認不出區間就整段放起日，讓使用者自己改。 */
export function splitDateRange(
  value: string,
): Pick<ExperienceRow, 'startDate' | 'endDate' | 'current'> {
  const match = RANGE.exec(value.trim());
  if (!match) return { startDate: value.trim(), endDate: '', current: false };
  const end = (match[2] ?? '').trim();
  const current = CURRENT.test(end);
  return { startDate: (match[1] ?? '').trim(), endDate: current ? '' : end, current };
}

const sameLine = (a: ImportDraftField, b: ImportDraftField): boolean =>
  a.pageNumber === b.pageNumber && a.lineIndex === b.lineIndex;

/**
 * 經歷預填：以「有公司名稱的那一行」為一段，同一行的日期、職稱帶入；
 * 之後到下一段之前、經歷段落中的其他行當描述。不跨行猜測公司與職稱的對應。
 */
function experiencesFrom(draft: ImportDraft): ExperienceRow[] {
  const keyLines = [...draft.companies, ...draft.dates];
  return draft.companies.map((company, i) => {
    const next = draft.companies[i + 1];
    const date = draft.dates.find((d) => sameLine(d, company));
    const title = draft.titles.find((t) => sameLine(t, company));
    const description = draft.experiences
      .filter(
        (line) =>
          line.pageNumber === company.pageNumber &&
          line.lineIndex > company.lineIndex &&
          (!next || next.pageNumber !== line.pageNumber || line.lineIndex < next.lineIndex) &&
          !keyLines.some((key) => sameLine(key, line)),
      )
      .map((line) => line.value)
      .join('\n');
    return {
      ...EMPTY_EXPERIENCE,
      company: company.value,
      title: title?.value ?? '',
      ...(date ? splitDateRange(date.value) : {}),
      description,
    };
  });
}

/** 欄位草稿 → 表單初值。 */
export function formFromDraft(draft: ImportDraft): ProfileForm {
  return {
    info: [{ label: '姓名', value: draft.name?.value ?? '' }],
    experiences: experiencesFrom(draft),
    skills: [...new Set(draft.skills.map((s) => s.value.trim()).filter((s) => s !== ''))],
  };
}

const blank = (text: string): boolean => !/\S/u.test(text);

/** 表單 → ProfileInput。有問題回逐條說明，不送出。 */
export function toProfileInput(
  form: ProfileForm,
): { ok: true; profile: ProfileInput } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const personalInfo: Record<string, string> = {};
  form.info.forEach((row, i) => {
    if (blank(row.value)) return;
    const label = row.label.trim();
    if (label === '') problems.push(`個人資料第 ${String(i + 1)} 列：欄位名稱不可空白`);
    else if (label in personalInfo) problems.push(`個人資料「${label}」重複`);
    else personalInfo[label] = row.value.trim();
  });
  const experiences = form.experiences.map((row, i) => {
    const at = `第 ${String(i + 1)} 段經歷`;
    if (blank(row.company)) problems.push(`${at}：公司不可空白`);
    if (blank(row.title)) problems.push(`${at}：職稱不可空白`);
    if (blank(row.startDate)) problems.push(`${at}：開始日期不可空白`);
    if (!row.current && blank(row.endDate)) problems.push(`${at}：請填結束日期或勾選「至今」`);
    return {
      company: row.company.trim(),
      title: row.title.trim(),
      startDate: row.startDate.trim(),
      endDate: row.current ? null : row.endDate.trim(),
      description: row.description.trim(),
    };
  });
  const skills = form.skills.map((s) => s.trim()).filter((s) => s !== '');
  if (Object.keys(personalInfo).length === 0 && experiences.length === 0 && skills.length === 0) {
    problems.push('內容全空：至少填一項個人資料、經歷或技能');
  }
  if (problems.length > 0) return { ok: false, problems };
  const parsed = ProfileInput.safeParse({ personalInfo, experiences, skills });
  if (!parsed.success) return { ok: false, problems: ['內容格式不正確，請檢查各欄位'] };
  return { ok: true, profile: parsed.data };
}
