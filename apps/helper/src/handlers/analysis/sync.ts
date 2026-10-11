// 授權集合 → 來源文件（P1-T060，R2、R4）：重新列舉已加入的資料夾（只列不讀），
// 只讀「已授權且仍在」的文件，算出每份 SourceDocument 的現況，交給 planAnalysis 判定。
// 讀檔一律經 SourceRegistry（只接受文件 ID、每次讀取留紀錄）；待確認的候選不讀、不建 SourceDocument。
import type { Claim, Id, SourceDocument } from '@rolecraft/contracts';
import type { AnalysisDocument } from '@rolecraft/pipeline';
import type { SourceRegistry } from '@rolecraft/sources';

export interface SyncInput {
  readonly registry: SourceRegistry;
  /** 目前保存的來源文件 */
  readonly stored: readonly SourceDocument[];
  /** 既有事實項：引用到的來源文件若已不存在，一律當成已刪除（R2 判定不得缺漏） */
  readonly claims: readonly Claim[];
  /** 資料夾 ID → 所屬資料夾（只留在 helper 內部；查不到用資料夾 ID） */
  readonly folderPathOf: (folderId: string) => string;
  readonly now: () => string;
}

export type SyncResult =
  | {
      readonly ok: true;
      /** 仍存在的來源文件現況（含已撤銷，已撤銷的不讀內容、text 為空） */
      readonly documents: readonly AnalysisDocument[];
      readonly deletedDocumentIds: readonly Id[];
      /** 要寫回資料庫的來源文件（新增、內容變更、授權狀態改變） */
      readonly changed: readonly SourceDocument[];
    }
  | { readonly ok: false; readonly reason: 'folder_unreadable' };

function sameDocument(a: SourceDocument, b: SourceDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 列舉每個資料夾；任一個列舉失敗就整個不做（不把暫時讀不到當成刪除）。 */
async function refreshAll(registry: SourceRegistry): Promise<boolean> {
  for (const folder of registry.folders()) {
    try {
      await registry.refreshFolder(folder.id);
    } catch {
      return false;
    }
  }
  return true;
}

export async function syncSources(input: SyncInput): Promise<SyncResult> {
  const { registry } = input;
  if (!(await refreshAll(registry))) return { ok: false, reason: 'folder_unreadable' };
  const stored = new Map(input.stored.map((doc) => [doc.id, doc]));
  const documents: AnalysisDocument[] = [];
  const deleted: Id[] = [];
  const changed: SourceDocument[] = [];
  const seen = new Set<Id>();
  const keep = (next: SourceDocument, text: string, previous: SourceDocument | undefined) => {
    documents.push({ document: next, text });
    if (!previous || !sameDocument(previous, next)) changed.push(next);
  };
  const revoked = (doc: SourceDocument) =>
    keep({ ...doc, authorizationStatus: 'revoked' }, '', doc);

  for (const item of registry.items()) {
    seen.add(item.id);
    const previous = stored.get(item.id);
    if (item.status !== 'authorized') {
      // 取消勾選（或從未確認）：不讀內容（R4）；保存過的文件標已撤銷
      if (previous) revoked(previous);
      continue;
    }
    const read = item.present ? await registry.read(item.id) : null;
    if (!read?.ok) {
      // 已不在、或不再符合安全讀檔條件（符號連結、過大、二進位等）：依據不再成立，視同刪除
      if (previous) deleted.push(item.id);
      continue;
    }
    const base: SourceDocument = previous ?? {
      id: item.id,
      folderPath: input.folderPathOf(item.folderId),
      documentPath: item.relPath,
      contentHash: read.contentHash,
      contentVersion: 1,
      authorizationStatus: 'authorized',
      importedAt: input.now(),
    };
    const contentChanged = base.contentHash !== read.contentHash;
    keep(
      {
        ...base,
        documentPath: item.relPath,
        contentHash: read.contentHash,
        contentVersion: contentChanged ? base.contentVersion + 1 : base.contentVersion,
        authorizationStatus: 'authorized',
      },
      read.text,
      previous,
    );
  }
  // 資料夾已移除（其下文件撤銷授權，bridge.md sources.remove_folder）
  for (const doc of stored.values()) if (!seen.has(doc.id)) revoked(doc);

  const known = new Set([...documents.map((d) => d.document.id), ...deleted]);
  for (const claim of input.claims) {
    for (const excerpt of claim.basis.sourceExcerpts) {
      if (!known.has(excerpt.sourceDocumentId)) {
        known.add(excerpt.sourceDocumentId);
        deleted.push(excerpt.sourceDocumentId);
      }
    }
  }
  return { ok: true, documents, deletedDocumentIds: deleted, changed };
}
