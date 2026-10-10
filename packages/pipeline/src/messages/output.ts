/**
 * 草稿輸出的格式驗證。輸出是資料：只解析成固定欄位的 JSON（可整份包一層 ```json）。
 * 多餘欄位、缺欄位、型別錯、空草稿、超量、編號格式錯，整份不合格，呼叫端當單元失敗處理、不寫入。
 */
import type { DraftOutput } from './types.ts';

export const DRAFT_OUTPUT_LIMITS = {
  rawChars: 20_000,
  draftChars: 2_000,
  citations: 10,
} as const;

export type DraftParseResult =
  | { readonly ok: true; readonly output: DraftOutput }
  | { readonly ok: false; readonly error: string };

const CLAIM_LABEL = /^C[1-9]\d{0,3}$/u;
const HAS_CONTENT = /\S/u;
const L = DRAFT_OUTPUT_LIMITS;

function unwrapFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?[ \t]*\n([\s\S]*)\n```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

const failed = (error: string): DraftParseResult => ({ ok: false, error });

export function parseDraftOutput(raw: string): DraftParseResult {
  if (raw.length > L.rawChars) return failed('輸出過長');
  let json: unknown;
  try {
    json = JSON.parse(unwrapFence(raw));
  } catch {
    return failed('輸出不是 JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return failed('輸出必須是物件');
  }
  const obj = json as Record<string, unknown>;
  const extra = Object.keys(obj).find((key) => key !== 'draft' && key !== 'citations');
  if (extra !== undefined) return failed(`輸出有不允許的欄位 ${extra}`);
  const { draft, citations } = obj;
  if (typeof draft !== 'string') return failed('draft 必須是字串');
  if (!HAS_CONTENT.test(draft)) return failed('draft 不可為空');
  if (draft.length > L.draftChars) return failed(`draft 超過 ${String(L.draftChars)} 字元`);
  if (!Array.isArray(citations)) return failed('citations 必須是陣列');
  if (citations.length > L.citations) return failed(`citations 超過 ${String(L.citations)} 項`);
  const labels: string[] = [];
  for (const label of citations) {
    if (typeof label !== 'string' || !CLAIM_LABEL.test(label)) {
      return failed('citations 有不是事實項編號的項目');
    }
    labels.push(label);
  }
  return { ok: true, output: { draft, citations: labels } };
}
