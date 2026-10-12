import {
  MAX_DOCUMENTS_PER_PROJECT,
  type ProjectGroupInput,
  type ProjectSuggestionView,
  type SuggestedDocument,
} from '@rolecraft/contracts';

/**
 * 分組建議的編輯稿（D23、P1-T063）：使用者在確認前可改名、取消某組、把文件移到別組或移出。
 * 純資料；確認時才轉成 claims.create_projects 的請求。
 */
export interface DraftGroup {
  /** 只在畫面上用的鍵（建議中的順序） */
  readonly key: string;
  readonly name: string;
  /** 取消勾選＝這組不建立，其文件不屬任何專案 */
  readonly included: boolean;
}

export interface GroupingDraft {
  readonly groups: readonly DraftGroup[];
  readonly documents: readonly SuggestedDocument[];
  /** 文件 ID → 組的 key；null＝未分組 */
  readonly assignment: Readonly<Record<string, string | null>>;
}

export function draftFromSuggestion(view: ProjectSuggestionView): GroupingDraft {
  const assignment: Record<string, string | null> = {};
  const documents: SuggestedDocument[] = [];
  const groups = view.groups.map((group, i) => {
    const key = `g${String(i)}`;
    for (const doc of group.documents) {
      documents.push(doc);
      assignment[doc.sourceDocumentId] = key;
    }
    return { key, name: group.name, included: true };
  });
  for (const doc of view.ungrouped) {
    documents.push(doc);
    assignment[doc.sourceDocumentId] = null;
  }
  return { groups, documents, assignment };
}

export function renameGroup(draft: GroupingDraft, key: string, name: string): GroupingDraft {
  return { ...draft, groups: draft.groups.map((g) => (g.key === key ? { ...g, name } : g)) };
}

export function toggleGroup(draft: GroupingDraft, key: string, included: boolean): GroupingDraft {
  return { ...draft, groups: draft.groups.map((g) => (g.key === key ? { ...g, included } : g)) };
}

export function moveDocument(
  draft: GroupingDraft,
  sourceDocumentId: string,
  key: string | null,
): GroupingDraft {
  return { ...draft, assignment: { ...draft.assignment, [sourceDocumentId]: key } };
}

export function documentsOf(draft: GroupingDraft, key: string | null): SuggestedDocument[] {
  return draft.documents.filter((d) => (draft.assignment[d.sourceDocumentId] ?? null) === key);
}

export type DraftRequest =
  { ok: true; projects: ProjectGroupInput[] } | { ok: false; reason: string };

/** 只送勾選、至少有一份文件的組；組名要有內容且不超過 100 字。 */
export function draftToRequest(draft: GroupingDraft): DraftRequest {
  const projects: ProjectGroupInput[] = [];
  for (const group of draft.groups) {
    if (!group.included) continue;
    const docs = documentsOf(draft, group.key);
    if (docs.length === 0) continue;
    if (docs.length > MAX_DOCUMENTS_PER_PROJECT) {
      return {
        ok: false,
        reason: `每個專案最多 ${String(MAX_DOCUMENTS_PER_PROJECT)} 份文件，請把文件分到其他組。`,
      };
    }
    const name = group.name.trim();
    if (name === '') return { ok: false, reason: '要建立的專案都要有名稱。' };
    if (name.length > 100) return { ok: false, reason: '專案名稱最多 100 字。' };
    projects.push({ name, sourceDocumentIds: docs.map((d) => d.sourceDocumentId) });
  }
  if (projects.length === 0) return { ok: false, reason: '沒有要建立的專案。' };
  return { ok: true, projects };
}
