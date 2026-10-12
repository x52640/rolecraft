/**
 * 分組建議的輸出驗證（D23、D6；P1-T063）。輸出是資料：只解析成固定欄位的 JSON。
 * 任何一處不符（多餘欄位、未知文件編號、同一文件出現兩次、組名空白或過長、空組、超量）整份不採用，
 * 不部分採用。沒被分到任何組的文件由呼叫端列為「未分組」。
 */
export const GROUPING_LIMITS = {
  /** 整份輸出字元上限 */
  rawChars: 100_000,
  groups: 100,
  /** 組名上限，與 contracts PROJECT_NAME_MAX_CHARS 相同 */
  name: 100,
  /** 每組文件上限，與 contracts MAX_DOCUMENTS_PER_PROJECT 相同（超過整份不採用，不自動拆組） */
  documentsPerGroup: 1000,
} as const;

export interface GroupDraft {
  readonly name: string;
  /** 本機編號（D1…），已確認都是已知且不重複 */
  readonly labels: readonly string[];
}

export type GroupingParseResult =
  | { readonly ok: true; readonly groups: readonly GroupDraft[] }
  | { readonly ok: false; readonly error: string };

class GroupingError extends Error {}

function fail(message: string): never {
  throw new GroupingError(message);
}

function record(value: unknown, where: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${where} 必須是物件`);
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) fail(`${where} 有不允許的欄位 ${key}`);
  }
  for (const key of keys) if (!(key in obj)) fail(`${where} 缺少 ${key}`);
  return obj;
}

function list(value: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${where} 必須是陣列`);
  if (value.length > max) fail(`${where} 超過 ${String(max)} 項`);
  return value;
}

/** 控制字元與行／段分隔字元（組名不得含換行等結構字元）。 */
function hasControl(text: string): boolean {
  return [...text].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
  });
}

function groupName(value: unknown, where: string): string {
  if (typeof value !== 'string') fail(`${where} 必須是字串`);
  const name = value.trim();
  if (!/\S/u.test(name)) fail(`${where} 不可為空`);
  if (name.length > GROUPING_LIMITS.name) fail(`${where} 過長`);
  if (hasControl(name)) fail(`${where} 含控制字元`);
  return name;
}

/** 去掉整份包住的 Markdown code fence（```json … ```）；其他前後文字一律不接受。 */
function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** 解析並驗證分組輸出；known 是提示中出現過的本機編號。 */
export function parseGroupingOutput(raw: string, known: ReadonlySet<string>): GroupingParseResult {
  try {
    if (raw.length > GROUPING_LIMITS.rawChars) fail('輸出過長');
    let json: unknown;
    try {
      json = JSON.parse(unwrapFence(raw));
    } catch {
      fail('輸出不是 JSON');
    }
    const obj = record(json, '輸出', ['groups']);
    const seen = new Set<string>();
    const groups = list(obj.groups, 'groups', GROUPING_LIMITS.groups).map((value, i) => {
      const where = `groups[${String(i)}]`;
      const group = record(value, where, ['name', 'documents']);
      const max = Math.min(known.size, GROUPING_LIMITS.documentsPerGroup);
      const labels = list(group.documents, `${where}.documents`, max).map((label) => {
        if (typeof label !== 'string' || !known.has(label)) fail(`${where} 引用未知文件`);
        if (seen.has(label)) fail(`${where} 文件重複出現`);
        seen.add(label);
        return label;
      });
      if (labels.length === 0) fail(`${where} 沒有文件`);
      return { name: groupName(group.name, `${where}.name`), labels };
    });
    return { ok: true, groups };
  } catch (error) {
    if (error instanceof GroupingError) return { ok: false, error: error.message };
    throw error;
  }
}
