/**
 * 個人資料標籤的辨識（P1-T069）。標籤比對前一律 NFKC、去掉所有空白（「姓  名」＝「姓名」）。
 * - 中文：標籤含關鍵字即算（手機、電話、地址、通訊、聯絡…）。
 * - 英文：拆成單字後含關鍵字即算（Home Address、Contact Number、Personal Email）；
 *   「name」「line」容易誤判（Company Name、Product Line），只認固定寫法。
 */
import { headingKey, normalizeForMatch } from './text.ts';

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

const ASCII_WORDS = new Set([
  'email',
  'mail',
  'phone',
  'mobile',
  'tel',
  'telephone',
  'cellphone',
  'cell',
  'fax',
  'address',
  'wechat',
  'skype',
  'telegram',
  'whatsapp',
  'linkedin',
  'github',
  'facebook',
  'instagram',
  'website',
  'homepage',
  'blog',
  'birthday',
  'birth',
  'dob',
  'gender',
  'contact',
]);

/** 只認整個標籤相等（去空白、連字號、轉小寫後）。 */
const ASCII_EXACT = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'englishname',
  'chinesename',
  'line',
  'lineid',
]);

const NAME_EXACT = new Set([
  'name',
  'fullname',
  'englishname',
  'chinesename',
  '英文姓名',
  '中文姓名',
]);

function compact(label: string): string {
  return headingKey(label).replace(/[-_.]/gu, '');
}

export function isPersonalLabel(label: string): boolean {
  const key = compact(label);
  if (key === '' || [...key].length > 24) return false;
  if (ASCII_EXACT.has(key)) return true;
  // 中文標籤限 8 字內（「負責與客戶聯絡協調：…」這種內文不算標籤）
  if ([...key].length <= 8 && CJK_KEYWORDS.some((k) => key.includes(k))) return true;
  const words = label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/e-mail/gu, 'email')
    .split(/[^a-z]+/u);
  return words.some((w) => ASCII_WORDS.has(w));
}

/** 這個標籤的值是姓名（抽到的值一律加入遮蔽集合）。 */
export function isNameLabel(label: string): boolean {
  const key = compact(label);
  return key.includes('姓名') || NAME_EXACT.has(key);
}

/** 冒號後緊接 // 是網址，不是標籤。標籤可含全形／半形空白（「地  址：」）。 */
const LABELED = /^\s*([^:：\t]{1,24}?)\s*(?:[:：](?!\/\/)|\t)\s*(.*)$/u;

/** 沒有冒號、以空白隔開的聯絡帳號（「LINE ID abc」「Mobile 0912…」）。 */
const SPACED =
  /^\s*((?:line|wechat|skype|telegram)(?:\s*id)?|e-?mail|mobile|phone|tel|手機|電話|信箱)\s+(\S+)\s*$/iu;
const CONTACTISH = /[\d@_]/u;

export interface LabelLine {
  readonly label: string;
  readonly value: string;
}

/** 「標籤：值」「標籤⇥值」或無冒號的聯絡帳號；不是個資標籤回 null。value 可為空（值在下一行）。 */
export function personalLabelLine(line: string): LabelLine | null {
  const labeled = LABELED.exec(line);
  if (labeled) {
    const label = (labeled[1] ?? '').trim();
    if (isPersonalLabel(label)) return { label, value: (labeled[2] ?? '').trim() };
  }
  const spaced = SPACED.exec(line.normalize('NFKC'));
  if (spaced) {
    const label = (spaced[1] ?? '').trim();
    const value = (spaced[2] ?? '').trim();
    const idLabel = /id$/iu.test(label) || /^line$/iu.test(label);
    if (/^id$/iu.test(value)) return null;
    if (idLabel || CONTACTISH.test(value)) return { label, value };
  }
  return null;
}

/**
 * 整行只有個資標籤（「E-mail：」「LINE ID」或雙欄「姓名⇥電話」）：回傳各欄標籤，值在下一行。
 */
export function labelOnlyLine(line: string): string[] | null {
  const segments = line
    .split('\t')
    .map((s) =>
      s
        .trim()
        .replace(/[:：]+$/u, '')
        .trim(),
    )
    .filter((s) => normalizeForMatch(s) !== '');
  // 「地址：台北」這種冒號後有值的不算（交給 personalLabelLine）
  if (segments.length === 0 || segments.some((s) => /[:：]/u.test(s))) return null;
  return segments.every(isPersonalLabel) ? segments : null;
}
