// 預覽頁的純邏輯：把 helper 回的扁平項目組成樹、算勾選狀態、算要送出的授權變更。
import { MAX_IDS_PER_REQUEST, type SourceEntry } from '@rolecraft/contracts';

export interface TreeNode {
  readonly entry: SourceEntry;
  readonly children: readonly TreeNode[];
}

/** 以 parentEntryId 組樹；同層子資料夾在前、再依名稱排序。找不到上層的項目放在最上層。 */
export function buildTree(entries: readonly SourceEntry[]): TreeNode[] {
  const ids = new Set(entries.map((e) => e.entryId));
  const childrenOf = new Map<string | null, SourceEntry[]>();
  for (const entry of entries) {
    const parent =
      entry.parentEntryId !== null && ids.has(entry.parentEntryId) ? entry.parentEntryId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(entry);
    childrenOf.set(parent, list);
  }
  const build = (parent: string | null, seen: Set<string>): TreeNode[] =>
    (childrenOf.get(parent) ?? [])
      .filter((entry) => !seen.has(entry.entryId))
      .sort(
        (a, b) =>
          (a.kind === 'container' ? 0 : 1) - (b.kind === 'container' ? 0 : 1) ||
          a.name.localeCompare(b.name),
      )
      .map((entry) => ({
        entry,
        children: build(entry.entryId, new Set([...seen, entry.entryId])),
      }));
  return build(null, new Set());
}

/** 節點底下（含自己）所有文件的 ID。 */
export function documentIds(node: TreeNode): string[] {
  if (node.entry.kind === 'document') return [node.entry.entryId];
  return node.children.flatMap(documentIds);
}

/** 初始勾選：只有已授權的文件。待確認的新檔不預先勾選（R4：不自動授權）。 */
export function initialChecked(entries: readonly SourceEntry[]): Set<string> {
  return new Set(
    entries
      .filter((e) => e.kind === 'document' && e.authorization === 'authorized')
      .map((e) => e.entryId),
  );
}

/** 建議納入（F03）的文件 ID；只用於「勾選建議文件」按鈕，不會自動送出。 */
export function suggestedIds(entries: readonly SourceEntry[]): string[] {
  return entries.filter((e) => e.kind === 'document' && e.suggested).map((e) => e.entryId);
}

export interface AuthorizationChanges {
  readonly authorize: string[];
  readonly revoke: string[];
}

/**
 * 使用者按「確認」時要送的變更：勾選且未授權的 → 授權；沒勾選且尚未標為不納入的 → 撤銷
 * （待確認的檔案沒勾選，確認後就記為不納入，下次增量更新只剩真正的新檔是待確認）。
 */
export function planChanges(
  entries: readonly SourceEntry[],
  checked: ReadonlySet<string>,
): AuthorizationChanges {
  const authorize: string[] = [];
  const revoke: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'document') continue;
    if (checked.has(entry.entryId)) {
      if (entry.authorization !== 'authorized') authorize.push(entry.entryId);
    } else if (entry.authorization !== 'revoked') {
      revoke.push(entry.entryId);
    }
  }
  return { authorize, revoke };
}

/** 拆成每則不超過請求上限的批次；先撤銷再授權。 */
export function toBatches(
  changes: AuthorizationChanges,
  limit = MAX_IDS_PER_REQUEST,
): AuthorizationChanges[] {
  const batches: AuthorizationChanges[] = [];
  for (let i = 0; i < changes.revoke.length; i += limit) {
    batches.push({ authorize: [], revoke: changes.revoke.slice(i, i + limit) });
  }
  for (let i = 0; i < changes.authorize.length; i += limit) {
    batches.push({ authorize: changes.authorize.slice(i, i + limit), revoke: [] });
  }
  return batches;
}

/** 檔案大小顯示。 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
