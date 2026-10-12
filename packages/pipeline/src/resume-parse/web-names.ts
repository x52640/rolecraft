/**
 * 網頁來源的已知姓名（D28；resume-import「網頁來源的 AI 整理」W6）：四個來源（姓名元素、姓名標籤的值、
 * 既有 Profile、使用者確認）合在一起只用於本機遮蔽與預填，不送模型。
 * - 別名：任何文字以已知的中文姓名開頭、後面接 1–3 個大寫開頭的英文字時，那段英文也當姓名
 *   （與 @rolecraft/resume-import headerNameAlias 同一規則；pipeline 不能依賴 resume-import，在這裡留一份）。
 *   英文名後面可接標點（「Ivy Lin，高雄人」；審查 1）；三個字的別名另加前兩個字。
 * - 「王小明 邏輯清晰」這種中文姓名後接空白與其他字的值，中文姓名本身也加入（cleanHeaderName 同一切法）。
 * - 「林雨晴／Ivy Lin」「林雨晴 (Ivy Lin)」依 ／ / ( ) 拆開，各自加入（審查 3）。
 * 拿不準時偏向多遮：中文姓名與英文字之間沒有空白也算。
 */
const CJK_NAME = /^\p{Script=Han}{2,}$/u;
const CJK_NAME_THEN_MORE = /^(\p{Script=Han}{2,5})\s+\S/u;
const ENGLISH_NAME = /^([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,2})(?![A-Za-z'.-])/u;
const NAME_SEPARATORS = /[／/()（）]/u;

/** 英文名（含三個字時的前兩個字）；結尾的 . ' - 不算。 */
function englishNames(text: string): string[] {
  const name = ENGLISH_NAME.exec(text)?.[1]?.replace(/[.'-]+$/u, '');
  if (!name) return [];
  const words = name.split(/\s+/u);
  return words.length === 3 ? [name, words.slice(0, 2).join(' ')] : [name];
}

function clean(name: string): string {
  return name.normalize('NFKC').trim();
}

/** 已知姓名本身加上拆開的各寫法、切出的中文姓名與英文別名。 */
function variantsOf(name: string): string[] {
  const whole = clean(name);
  const pieces = whole.split(NAME_SEPARATORS).map((piece) => piece.trim());
  // 「林 雨晴」：中文字間的空白去掉也是一個寫法（P1-T080 審查 4；別名比對靠它）
  const joined = [whole, ...pieces].flatMap((text) => {
    const stripped = text.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '');
    return stripped === text ? [] : [stripped];
  });
  return [whole, ...pieces, ...joined].flatMap((text) => {
    const han = CJK_NAME_THEN_MORE.exec(text)?.[1];
    if (!han) return [text];
    return [text, han, ...englishNames(text.slice(han.length).trim())];
  });
}

/** 文字以某個中文姓名開頭、後面接英文名時回傳英文名。 */
function aliasAfter(text: string, cjkNames: readonly string[]): string[] {
  const line = clean(text);
  return cjkNames.flatMap((name) =>
    line.startsWith(name) ? englishNames(line.slice(name.length).trim()) : [],
  );
}

/** 全部已知姓名（去重、去空白），含各文字開頭的英文別名。 */
export function knownNames(names: readonly string[], texts: readonly string[]): string[] {
  const all = new Set(names.flatMap(variantsOf).filter((n) => n !== ''));
  const cjk = [...all].filter((n) => CJK_NAME.test(n));
  for (const text of texts) for (const alias of aliasAfter(text, cjk)) all.add(alias);
  return [...all];
}
