/**
 * 網頁來源的已知姓名（D28；resume-import「網頁來源的 AI 整理」W6）：四個來源（姓名元素、姓名標籤的值、
 * 既有 Profile、使用者確認）合在一起只用於本機遮蔽與預填，不送模型。
 * - 別名：任何文字以已知的中文姓名開頭、後面接 1–3 個大寫開頭的英文字時，那段英文也當姓名
 *   （與 @rolecraft/resume-import headerNameAlias 同一規則；pipeline 不能依賴 resume-import，在這裡留一份）。
 * - 「王小明 邏輯清晰」這種中文姓名後接空白與其他字的值，中文姓名本身也加入（cleanHeaderName 同一切法）。
 * 拿不準時偏向多遮：中文姓名與英文字之間沒有空白也算。
 */
const CJK_NAME = /^\p{Script=Han}{2,}$/u;
const CJK_NAME_THEN_MORE = /^(\p{Script=Han}{2,5})\s+\S/u;
const ENGLISH_NAME = /^([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,2})(?=\s|$)/u;

function clean(name: string): string {
  return name.normalize('NFKC').trim();
}

/** 已知姓名本身加上切出的中文姓名與英文別名。 */
function variantsOf(name: string): string[] {
  const text = clean(name);
  const han = CJK_NAME_THEN_MORE.exec(text)?.[1];
  if (!han) return [text];
  const alias = ENGLISH_NAME.exec(text.slice(han.length).trim())?.[1];
  return alias ? [text, han, alias] : [text, han];
}

/** 文字以某個中文姓名開頭、後面接英文名時回傳英文名。 */
function aliasAfter(text: string, cjkNames: readonly string[]): string[] {
  const line = clean(text);
  return cjkNames.flatMap((name) => {
    if (!line.startsWith(name)) return [];
    const alias = ENGLISH_NAME.exec(line.slice(name.length).trim())?.[1];
    return alias ? [alias] : [];
  });
}

/** 全部已知姓名（去重、去空白），含各文字開頭的英文別名。 */
export function knownNames(names: readonly string[], texts: readonly string[]): string[] {
  const all = new Set(names.flatMap(variantsOf).filter((n) => n !== ''));
  const cjk = [...all].filter((n) => CJK_NAME.test(n));
  for (const text of texts) for (const alias of aliasAfter(text, cjk)) all.add(alias);
  return [...all];
}
