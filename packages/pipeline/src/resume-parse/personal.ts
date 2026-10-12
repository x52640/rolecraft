/**
 * 姓名與聯絡資料只在本機處理（P1-T069，協調者保守選擇）：送給模型前先抽出並移除。
 * - 「標籤：值」「標籤 ⇥ 值」的個人資料行（手機、電話、E-mail、地址、LINE、生日、性別等）整行移除，
 *   由本機直接預填；104 的值換行續行（依本機規則已知的值）一併移除。
 * - 「聯絡方式」「基本資料」等標題下到下一個段落標題前（最多 8 行）整段移除。
 * - 其餘行裡的姓名、已抽出的個資值、看起來像 email／電話／身分證字號的片段換成佔位字（〔姓名〕、〔個資1〕…），
 *   模型只看得到佔位字；檢查通過的值在本機換回原文後再對原文檢查一次。
 */
import type { ImportDraftField } from '@rolecraft/contracts';

import { headingKey, isSectionHeading, normalizeForMatch } from './text.ts';
import type { PersonalHint, ResumeParseInputs, SentLine } from './types.ts';

const CJK_KEYWORDS = [
  '姓名',
  '手機',
  '電話',
  '市話',
  '傳真',
  '電子郵件',
  '信箱',
  '郵件',
  '地址',
  '住址',
  '居住地',
  '通訊',
  '聯絡',
  '聯繫',
  '網站',
  '部落格',
  '微信',
  '身分證',
  '身份證',
  '生日',
  '出生',
  '年齡',
  '性別',
  '婚姻',
  '兵役',
  '國籍',
  '個人資料',
  '基本資料',
];

/** 英文標籤整個相等才算（避免「Company name」被當成姓名）。比對前去空白、連字號、轉小寫。 */
const ASCII_LABELS = new Set([
  'email',
  'mail',
  'phone',
  'mobile',
  'tel',
  'telephone',
  'cellphone',
  'fax',
  'address',
  'line',
  'lineid',
  'wechat',
  'skype',
  'telegram',
  'whatsapp',
  'linkedin',
  'github',
  'facebook',
  'instagram',
  'website',
  'blog',
  'birthday',
  'dateofbirth',
  'gender',
  'name',
  'fullname',
  'contact',
]);

const CONTACT_HEADINGS = new Set([
  '聯絡方式',
  '聯絡資訊',
  '聯絡資料',
  '個人資料',
  '基本資料',
  'contact',
  'contactinformation',
  'personalinformation',
  'personaldetails',
]);
const CONTACT_BLOCK_MAX = 8;

/** 冒號後緊接 // 是網址，不是標籤。 */
const LABELED = /^\s*([^:：\t]{1,12}?)\s*(?:[:：](?!\/\/)|\t)\s*(.*)$/u;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const PHONE =
  /(?<![\d/.:-])(?:\+\d{1,3}[\s-]?\d|\(0\d{1,3}\)[\s-]?\d|0\d)(?:[\s-]?\d){6,11}(?![\d/])/gu;
const NATIONAL_ID = /(?<![A-Za-z\d])[A-Z][12]\d{8}(?!\d)/gu;
const TOKEN = /〔(?:姓名|個資)\d*〕/gu;

export function isPersonalLabel(label: string): boolean {
  const ascii = label.toLowerCase().replace(/[\s_-]/gu, '');
  return ASCII_LABELS.has(ascii) || CJK_KEYWORDS.some((k) => label.includes(k));
}

export interface PersonalRow {
  readonly label: string;
  readonly value: ImportDraftField;
}

export interface PersonalExtraction {
  readonly sent: readonly SentLine[];
  readonly personalInfo: readonly PersonalRow[];
  /** 佔位字 → 原文 */
  readonly tokens: ReadonlyMap<string, string>;
}

interface Kept {
  pageNumber: number;
  lineIndex: number;
  original: string;
}

interface Continuation {
  hint: string;
  remaining: number;
}

/** 第一遍：分出要移除的個資行（記成 rows）與要送出的行。 */
function split(inputs: ResumeParseInputs) {
  const rows: { label: string; value: ImportDraftField }[] = [];
  const kept: Kept[] = [];
  /** 同一標籤只留第一個；append＝聯絡區塊裡沒有標籤的行，接在同一列後面 */
  const addRow = (
    label: string,
    value: string,
    pageNumber: number,
    lineIndex: number,
    append = false,
  ) => {
    const clean = value.trim();
    if (label === '' || clean === '') return;
    const existing = rows.find((r) => r.label === label);
    if (existing && append)
      existing.value = { ...existing.value, value: `${existing.value.value}\n${clean}` };
    if (existing) return;
    rows.push({ label, value: { value: clean, pageNumber, lineIndex } });
  };
  const first = inputs.names[0];
  if (first) addRow('姓名', first.value, first.pageNumber, first.lineIndex);
  const hintFor = (label: string, value: string): PersonalHint | undefined => {
    const start = normalizeForMatch(value);
    return inputs.personalHints.find(
      (h) => h.label === label && start !== '' && normalizeForMatch(h.value).startsWith(start),
    );
  };

  let block: { label: string; remaining: number } | null = null;
  let continuation: Continuation | null = null;
  for (const page of inputs.pages) {
    page.lines.forEach((original, lineIndex) => {
      const { pageNumber } = page;
      const norm = normalizeForMatch(original);
      if (norm === '') return;
      const labeled = LABELED.exec(original);
      if (block && (isSectionHeading(original) || block.remaining <= 0)) block = null;
      if (block) {
        block.remaining -= 1;
        if (labeled) addRow((labeled[1] ?? '').trim(), labeled[2] ?? '', pageNumber, lineIndex);
        else addRow(block.label, original, pageNumber, lineIndex, true);
        return;
      }
      if (CONTACT_HEADINGS.has(headingKey(original))) {
        block = { label: original.trim().replace(/[:：]+$/u, ''), remaining: CONTACT_BLOCK_MAX };
        continuation = null;
        return;
      }
      const label = (labeled?.[1] ?? '').trim();
      if (labeled && isPersonalLabel(label)) {
        const value = labeled[2] ?? '';
        const hint = hintFor(label, value);
        addRow(label, hint?.value ?? value, pageNumber, lineIndex);
        continuation = hint ? { hint: normalizeForMatch(hint.value), remaining: 2 } : null;
        return;
      }
      if (
        continuation &&
        !labeled &&
        continuation.remaining > 0 &&
        continuation.hint.includes(norm)
      ) {
        continuation.remaining -= 1;
        return;
      }
      continuation = null;
      kept.push({ pageNumber, lineIndex, original });
    });
  }
  return { rows, kept };
}

/** 第二遍：把姓名、已抽出的個資值與 email／電話／身分證字號片段換成佔位字。 */
function redactor(inputs: ResumeParseInputs, rows: readonly PersonalRow[]) {
  const tokens = new Map<string, string>();
  const byValue = new Map<string, string>();
  const tokenFor = (secret: string, name: boolean): string => {
    const existing = byValue.get(secret);
    if (existing) return existing;
    const count = [...tokens.keys()].filter((t) => t.startsWith(name ? '〔姓名' : '〔個資')).length;
    const token = name
      ? `〔姓名${count === 0 ? '' : String(count + 1)}〕`
      : `〔個資${String(count + 1)}〕`;
    tokens.set(token, secret);
    byValue.set(secret, token);
    return token;
  };
  const names = [...new Set(inputs.names.map((n) => n.value.trim()))].filter((n) => n.length >= 2);
  const values = rows
    .filter((r) => r.label !== '姓名')
    .flatMap((r) => r.value.value.split('\n'))
    .map((v) => v.trim())
    .filter((v) => [...v].length >= 3);
  const secrets = [
    ...names.map((s) => ({ s, name: true })),
    ...[...new Set(values)].map((s) => ({ s, name: false })),
  ].sort((a, b) => b.s.length - a.s.length);

  const redact = (text: string): string => {
    let out = text;
    for (const { s, name } of secrets) {
      if (out.includes(s)) out = out.split(s).join(tokenFor(s, name));
    }
    for (const pattern of [EMAIL, PHONE, NATIONAL_ID]) {
      out = out.replace(pattern, (match) => tokenFor(match, false));
    }
    return out;
  };
  return { redact, tokens };
}

export function extractPersonal(inputs: ResumeParseInputs): PersonalExtraction {
  const { rows, kept } = split(inputs);
  const { redact, tokens } = redactor(inputs, rows);
  const sent = kept.map((k, order): SentLine => ({
    id: `${String(k.pageNumber)}-${String(k.lineIndex + 1)}`,
    order,
    pageNumber: k.pageNumber,
    lineIndex: k.lineIndex,
    text: redact(k.original),
    original: k.original,
  }));
  return { sent, personalInfo: rows, tokens };
}

/** 佔位字換回原文；不認得的佔位字原樣保留（之後對原文的檢查會把它擋掉）。 */
export function unredact(value: string, tokens: ReadonlyMap<string, string>): string {
  return value.replace(TOKEN, (token) => tokens.get(token) ?? token);
}
