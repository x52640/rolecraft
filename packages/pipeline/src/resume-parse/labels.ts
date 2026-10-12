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
  '本名',
  '個人資料',
  '基本資料',
  // P1-T078 審查 3（PDF 與網頁共用，偏向多遮）
  '英文名',
  '中文名',
  '暱稱',
  '綽號',
  '現居',
  '戶籍',
  '居住城市',
  '年次',
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
  'born',
  'nickname',
  'surname',
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
  'givenname',
  'familyname',
  'middlename',
]);

/** 姓名標籤（整個標籤相等）；isPersonalLabel 與 isNameLabel 都認（審查 6：First Name／Last Name 一致）。 */
const NAME_EXACT = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'givenname',
  'familyname',
  'middlename',
  'surname',
  'nickname',
  '姓',
  '名',
  '姓氏',
  '名字',
  'englishname',
  'chinesename',
  '英文姓名',
  '中文姓名',
]);

function compact(label: string): string {
  return headingKey(label).replace(/[-_.]/gu, '');
}

/**
 * 括號修飾（「地址（戶籍）」「住址(住家)」「Address (Permanent)」；codex 複審 1）：NFKC 後去掉成對的括號段，
 * 剩下的部分非空才回傳。辨識時原樣與去括號後任一個認得就算，不會比原本少認。
 */
const PAREN = /\([^()]*\)/gu;
function withoutParens(label: string): string | null {
  const stripped = label.normalize('NFKC').replace(PAREN, ' ').trim();
  return stripped !== '' && stripped !== label.normalize('NFKC').trim() ? stripped : null;
}

export function isPersonalLabel(label: string): boolean {
  const bare = withoutParens(label);
  return looseLabel(label) || (bare !== null && looseLabel(bare));
}

function looseLabel(label: string): boolean {
  const key = compact(label);
  if (key === '' || [...key].length > 24) return false;
  if (ASCII_EXACT.has(key) || NAME_EXACT.has(key)) return true;
  // 中文標籤限 8 字內（「負責與客戶聯絡協調：…」這種內文不算標籤）
  if ([...key].length <= 8 && CJK_KEYWORDS.some((k) => key.includes(k))) return true;
  const words = label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/e-mail/gu, 'email')
    .split(/[^a-z]+/u);
  // 嚴格辨識認得的（Line帳號、LineID）一定也算
  return words.some((w) => ASCII_WORDS.has(w)) || isStrictPersonalLabel(label);
}

/**
 * 嚴格辨識（標籤獨占一行、會連下一行一起移除時用；對抗審查 2026-10-12 改寫）。拿不準時偏向當成個資。
 * - 精確別名：去空白、連字號、轉小寫後等於 ASCII_EXACT／NAME_EXACT（LineID、FullName、中文姓名）。
 * - 中文部分（去掉空白、英數、標點；中間夾全形空白的「地址」也認得）限 8 字內，且以「關鍵字」或「關鍵字＋結尾字」
 *   （號、號碼、字號、帳號、年月日、地、處、人…）結尾；前面可接任意修飾（居住地址、公司電話、緊急聯絡人、
 *   出生年月日、身分證字號、英文本名）。關鍵字後面接一般詞（通訊軟體開發、網站改版）不算。
 * - 英文部分每個字（不在詞彙裡時試駝峰拆字）都必須屬個資詞彙（關鍵字或修飾字），且至少一個關鍵字；
 *   「Mobile Developer」「GitHub Actions」「Product Line」不算。
 * - 中英混合（Line帳號、電話 Phone）：英文字全屬個資詞彙，中文部分符合上條或只由結尾字組成。
 */
const CJK_SUFFIXES = '號碼 字號 帳號 帳戶 年月日 日期 方式 資訊 資料 狀況 狀態 號 地 處 人'.split(
  ' ',
);
const ASCII_FILLERS = new Set(
  (
    'number no id personal home work office primary current present permanent residential residence ' +
    'mailing postal emergency person alternate secondary full first last given family legal english ' +
    'chinese info information details date place of account url profile page link site web handle user username'
  ).split(' '),
);
const ASCII_KEYWORDS = new Set([...ASCII_WORDS, 'name', 'line']);
const SUFFIX = `(?:${CJK_SUFFIXES.join('|')})`;
const CJK_TAIL = new RegExp(`(?:${CJK_KEYWORDS.join('|')})${SUFFIX}?$`, 'u');
const CJK_SUFFIX_ONLY = new RegExp(`^${SUFFIX}+$`, 'u');
const isVocabulary = (w: string) => ASCII_KEYWORDS.has(w) || ASCII_FILLERS.has(w);

/** 英文字全屬個資詞彙時回傳是否含關鍵字；有任何非個資字回 null。 */
function asciiVocabulary(label: string): boolean | null {
  let keyword = false;
  const words =
    label
      .normalize('NFKC')
      .replace(/e-mail/giu, 'email')
      .match(/[A-Za-z]+/gu) ?? [];
  for (const word of words) {
    const tries = [[word], word.split(/(?<=[a-z])(?=[A-Z])/u)].map((t) =>
      t.map((w) => w.toLowerCase()),
    );
    const pieces = tries.find((t) => t.every(isVocabulary));
    if (!pieces) return null;
    if (pieces.some((w) => ASCII_KEYWORDS.has(w))) keyword = true;
  }
  return keyword;
}

export function isStrictPersonalLabel(label: string): boolean {
  const bare = withoutParens(label);
  return strictLabel(label) || (bare !== null && strictLabel(bare));
}

function strictLabel(label: string): boolean {
  const key = compact(label);
  if (key === '') return false;
  if (ASCII_EXACT.has(key) || NAME_EXACT.has(key)) return true;
  const cjk = key.replace(/[\p{ASCII}\p{P}\p{S}]/gu, '');
  if ([...cjk].length > 8) return false;
  const asciiKeyword = asciiVocabulary(label);
  if (asciiKeyword === null) return false;
  if (cjk === '') return asciiKeyword;
  return CJK_TAIL.test(cjk) || (asciiKeyword && CJK_SUFFIX_ONLY.test(cjk));
}

const NAME_PARTS = ['姓名', '英文名', '中文名', '暱稱', '綽號', '本名'];

/** 這個標籤的值是姓名（抽到的值一律加入遮蔽集合）。去括號修飾後再認一次（「姓名（中文）」）。 */
export function isNameLabel(label: string): boolean {
  const bare = withoutParens(label);
  return [label, ...(bare === null ? [] : [bare])].some((l) => {
    const key = compact(l);
    return NAME_PARTS.some((k) => key.includes(k)) || NAME_EXACT.has(key);
  });
}

/**
 * 網頁標籤＋值區塊的標籤（網頁專用，P1-T078 審查 3）：位置已確定是標籤，中文標籤不受 8 字限制
 * （「緊急聯絡人姓名與電話」）；其餘同 isPersonalLabel。
 */
export function isPersonalBlockLabel(label: string): boolean {
  const key = compact(label);
  return isPersonalLabel(label) || CJK_KEYWORDS.some((k) => key.includes(k));
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
 * 會連下一行一起移除，所以用嚴格辨識（codex 審查 2）。
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
  return segments.every(isStrictPersonalLabel) ? segments : null;
}
