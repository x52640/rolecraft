/**
 * 模板輸入（D15 中文單一模板）。這是「要印出來的內容」，不是資料庫物件：
 * 由 helper 把 Profile（公司、職稱、日期，R1 不交給模型）與 ResumeVersion 各段組裝而成。
 * 所有文字都會原樣（只做 HTML 跳脫）印出，匯出後逐字比對。
 */

/** 可點擊的連結。只允許 https／http／mailto（見 validateDocument）。 */
export interface TemplateLink {
  /** 印在紙上的字 */
  readonly text: string;
  readonly href: string;
}

/** 一行聯絡資訊；有 href 就是可點擊連結。 */
export interface ContactItem {
  readonly text: string;
  readonly href?: string;
}

/** 段落內的項目。 */
export type TemplateItem =
  /** 經歷／專案標題列：例如「公司｜職稱」＋右側日期 */
  | { readonly kind: 'entry'; readonly title: string; readonly meta?: string }
  /** 一般段落 */
  | { readonly kind: 'paragraph'; readonly text: string }
  /** 條列 */
  | { readonly kind: 'bullet'; readonly text: string }
  /** 獨立一行的連結 */
  | { readonly kind: 'link'; readonly link: TemplateLink };

export interface TemplateSection {
  /** 段落標題，例如「工作經歷」 */
  readonly heading: string;
  readonly items: readonly TemplateItem[];
}

/** 一份要匯出的履歷。 */
export interface ResumeDocument {
  /** 姓名（頁首大字） */
  readonly name: string;
  /** 一句話職稱或定位，可省略 */
  readonly headline?: string;
  readonly contacts: readonly ContactItem[];
  readonly sections: readonly TemplateSection[];
}

/** 允許的連結協定。javascript:、file: 等一律拒絕。 */
const SAFE_HREF = /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/iu;

/** 不可見控制字元（保留 \t \n 由版面處理）；印出來看不到，比對也無意義。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export interface DocumentProblem {
  /** 出問題的欄位位置，例如 sections[1].items[0].text */
  readonly path: string;
  readonly reason: 'empty' | 'control_char' | 'unsafe_href';
}

/** 匯出前的結構檢查；回傳空陣列才可匯出。 */
export function validateDocument(doc: ResumeDocument): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  const text = (value: string, path: string, allowEmpty = false): void => {
    if (!allowEmpty && value.trim() === '') problems.push({ path, reason: 'empty' });
    else if (CONTROL_CHARS.test(value)) problems.push({ path, reason: 'control_char' });
  };
  const href = (value: string, path: string): void => {
    if (!SAFE_HREF.test(value)) problems.push({ path, reason: 'unsafe_href' });
  };

  text(doc.name, 'name');
  if (doc.headline !== undefined) text(doc.headline, 'headline');
  doc.contacts.forEach((c, i) => {
    text(c.text, `contacts[${i}].text`);
    if (c.href !== undefined) href(c.href, `contacts[${i}].href`);
  });
  doc.sections.forEach((s, si) => {
    const base = `sections[${si}]`;
    text(s.heading, `${base}.heading`);
    if (s.items.length === 0) problems.push({ path: `${base}.items`, reason: 'empty' });
    s.items.forEach((item, ii) => {
      const at = `${base}.items[${ii}]`;
      switch (item.kind) {
        case 'entry':
          text(item.title, `${at}.title`);
          if (item.meta !== undefined) text(item.meta, `${at}.meta`);
          break;
        case 'paragraph':
        case 'bullet':
          text(item.text, `${at}.text`);
          break;
        case 'link':
          text(item.link.text, `${at}.link.text`);
          href(item.link.href, `${at}.link.href`);
          break;
      }
    });
  });
  return problems;
}

/** 文件中所有連結網址（去重、保持出現順序）。 */
export function collectHrefs(doc: ResumeDocument): string[] {
  const hrefs = [
    ...doc.contacts.flatMap((c) => (c.href === undefined ? [] : [c.href])),
    ...doc.sections.flatMap((s) =>
      s.items.flatMap((i) => (i.kind === 'link' ? [i.link.href] : [])),
    ),
  ];
  return [...new Set(hrefs)];
}
