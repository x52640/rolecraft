// import.confirm 寫出處用的草稿（D30，resume-import「個人資料編輯（D30）」）：把該工作階段的草稿
// （AI 整理成功用 AI 草稿，否則用本機預填）整理成同一個形狀，每個值帶它在原文裡的出處單位位置
// （PDF 的行、網頁的區塊，依原文順序編號）。出處文字之後一律從工作階段原文（units）取，不從請求取。
import type {
  ImportAiParseView,
  ImportDraft,
  ImportDraftField,
  ImportResult,
  ImportWebDraftField,
} from '@rolecraft/contracts';

/** 草稿的一個值與它引用的原文單位位置（依引用順序）。 */
export interface DraftValue {
  readonly value: string;
  readonly at: readonly number[];
}

export interface DraftExperience {
  readonly company: DraftValue | null;
  readonly title: DraftValue | null;
  readonly startDate: DraftValue | null;
  readonly endDate: DraftValue | null;
  readonly description: DraftValue | null;
}

/** 比對用的草稿：原文單位（文字依原文順序）＋各欄位。kind 是出處種類。 */
export interface SourceDraft {
  readonly kind: 'web' | 'pdf';
  readonly units: readonly string[];
  readonly personalInfo: readonly { readonly label: string; readonly field: DraftValue }[];
  readonly education: readonly DraftValue[];
  readonly experiences: readonly DraftExperience[];
  readonly skills: readonly DraftValue[];
}

/** AI 草稿與 104 結構化草稿共同的欄位結構。 */
interface DraftLike<F> {
  readonly personalInfo: readonly { readonly label: string; readonly value: F }[];
  readonly education?: readonly F[];
  readonly experiences: readonly {
    readonly company: F | null;
    readonly title: F | null;
    readonly startDate: F | null;
    readonly endDate: F | null;
    readonly description: F | null;
  }[];
  readonly skills: readonly F[];
}

/** 原文單位與「出處 → 位置」對照；對不到的出處略過（不當成出處）。 */
interface Units<F> {
  readonly texts: readonly string[];
  readonly at: (field: F) => number[];
}

function shapeOf<F extends { readonly value: string }>(
  kind: 'web' | 'pdf',
  draft: DraftLike<F>,
  units: Units<F>,
): SourceDraft {
  const value = (field: F): DraftValue => ({ value: field.value, at: units.at(field) });
  const optional = (field: F | null) => (field ? value(field) : null);
  return {
    kind,
    units: units.texts,
    personalInfo: draft.personalInfo.map((row) => ({ label: row.label, field: value(row.value) })),
    education: (draft.education ?? []).map(value),
    experiences: draft.experiences.map((e) => ({
      company: optional(e.company),
      title: optional(e.title),
      startDate: optional(e.startDate),
      endDate: optional(e.endDate),
      description: optional(e.description),
    })),
    skills: draft.skills.map(value),
  };
}

type Pages = Extract<ImportResult, { status: 'parsed' }>['pages'];

/** PDF：所有行依頁、行序攤平；出處＝第一行＋moreLines。 */
function pdfUnits(pages: Pages): Units<ImportDraftField> {
  const texts: string[] = [];
  const index = new Map<string, number>();
  for (const page of pages) {
    page.lines.forEach((line, i) => {
      index.set(`${String(page.pageNumber)}:${String(i)}`, texts.length);
      texts.push(line);
    });
  }
  const find = (pageNumber: number, lineIndex: number) =>
    index.get(`${String(pageNumber)}:${String(lineIndex)}`);
  return {
    texts,
    at: (field) =>
      [field, ...(field.moreLines ?? [])]
        .map((ref) => find(ref.pageNumber, ref.lineIndex))
        .filter((n): n is number => n !== undefined),
  };
}

/** 網頁：區塊依編號順序；出處＝blockId＋moreBlockIds。 */
function webUnits(
  blocks: Extract<ImportResult, { status: 'web_capture' }>['blocks'],
): Units<ImportWebDraftField> {
  const index = new Map(blocks.map((block, i) => [block.id, i]));
  return {
    texts: blocks.map((block) => block.text),
    at: (field) =>
      [field.blockId, ...(field.moreBlockIds ?? [])]
        .map((id) => index.get(id))
        .filter((n): n is number => n !== undefined),
  };
}

/** PDF 本機預填（沒有 AI 草稿時）：有 104 結構化草稿用它；否則只有姓名與技能（經歷不跨行猜對應）。 */
function pdfLocal(draft: ImportDraft): DraftLike<ImportDraftField> {
  if (draft.structured) return draft.structured;
  return {
    personalInfo: draft.name ? [{ label: '姓名', value: draft.name }] : [],
    experiences: [],
    skills: draft.skills,
  };
}

/**
 * 這個工作階段用來比對的草稿：AI 整理成功用 AI 草稿，否則用本機預填（PDF）；
 * 網頁沒有 AI 草稿、手動輸入、PDF 解析失敗沒有草稿（不寫出處）。
 */
export function sourceDraftOf(
  result: ImportResult,
  view: ImportAiParseView | null,
): SourceDraft | null {
  const succeeded = view?.state === 'succeeded';
  if (result.status === 'web_capture') {
    const draft = succeeded ? view.webDraft : null;
    return draft ? shapeOf('web', draft, webUnits(result.blocks)) : null;
  }
  if (result.status !== 'parsed') return null;
  const draft = succeeded && view.draft ? view.draft : pdfLocal(result.draft);
  return shapeOf('pdf', draft, pdfUnits(result.pages));
}
