// 把 registry 的候選文件（相對路徑）組成預覽樹：子資料夾與文件各有不透明 ID，以上層 ID 相連。
// 回應只有名稱（最後一段），不含任何路徑字串（R7）。
import type { SourceEntry } from '@rolecraft/contracts';
import type { SourceItem } from '@rolecraft/sources';

/**
 * 優先納入（F03）的門檻：sources 篩選的優先序 0–5 是 README、CLAUDE/AGENTS、plan、規格／架構、
 * task、完成紀錄，自訂檔名是 1；其餘一般文件是 9。
 */
const SUGGESTED_MAX_PRIORITY = 5;

/** 沒有可見字元的名稱（例如全是空白或全形空白）在畫面上的替代名稱。 */
export const UNNAMED_ENTRY = '（未命名）';

/** 顯示用名稱：沒有可見字元就用替代名稱（contracts 的名稱必須有可見字元）。 */
export function visibleName(name: string): string {
  return /\S/u.test(name) ? name : UNNAMED_ENTRY;
}

/** 文件類型：副檔名（不含點、小寫）；沒有副檔名回空字串。 */
export function formatOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * @param items 該資料夾最近一次列舉仍在的候選文件
 * @param containerIds 子資料夾相對路徑 → ID；同一資料夾跨次預覽沿用（會被補上新路徑）
 * @param newId 配發新 ID
 */
export function buildPreviewEntries(
  items: readonly SourceItem[],
  containerIds: Map<string, string>,
  newId: () => string,
): SourceEntry[] {
  const containers = new Map<string, SourceEntry>();
  const documents: SourceEntry[] = [];

  const containerFor = (segments: readonly string[]): string | null => {
    let parentId: string | null = null;
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const dir = segments.slice(0, depth).join('/');
      let id = containerIds.get(dir);
      if (id === undefined) {
        id = newId();
        containerIds.set(dir, id);
      }
      if (!containers.has(dir)) {
        containers.set(dir, {
          entryId: id,
          parentEntryId: parentId,
          name: visibleName(segments[depth - 1] ?? dir),
          kind: 'container',
          sizeBytes: null,
          format: '',
          authorization: null,
          suggested: false,
        });
      }
      parentId = id;
    }
    return parentId;
  };

  for (const item of items) {
    const segments = item.relPath.split('/');
    const name = segments.pop() ?? item.relPath;
    documents.push({
      entryId: item.id,
      parentEntryId: containerFor(segments),
      name: visibleName(name),
      kind: 'document',
      sizeBytes: item.size,
      format: formatOf(name),
      authorization: item.status,
      suggested: item.priority <= SUGGESTED_MAX_PRIORITY,
    });
  }
  return [...containers.values(), ...documents];
}
