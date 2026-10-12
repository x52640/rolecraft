// 事實項來源文件的顯示名稱（P1-T073）：只給檔名與資料夾名稱的最後一段，不含上層路徑（R7）。
import type { Claim, ClaimSourceName, SourceDocument } from '@rolecraft/contracts';

const NAME_MAX_CHARS = 200;
const UNNAMED = '（未命名）';

/** 路徑的最後一段；控制字元換成空白，去頭尾空白，過長截斷，空的給「（未命名）」。 */
export function lastSegmentOf(value: string): string {
  const base =
    value
      .split(/[/\\]/u)
      .filter((part) => part.trim() !== '')
      .at(-1) ?? '';
  // eslint-disable-next-line no-control-regex -- 刻意比對控制字元
  const clean = base.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim();
  return clean === '' ? UNNAMED : [...clean].slice(0, NAME_MAX_CHARS).join('');
}

/** 列出事實項引用到的來源文件名稱（依第一次出現的順序、不重複）；查不到的文件不列。 */
export function sourceNamesOf(
  getDocument: (id: string) => SourceDocument | null,
  claims: readonly Claim[],
): ClaimSourceName[] {
  const ids = new Set(
    claims.flatMap((claim) => claim.basis.sourceExcerpts.map((e) => e.sourceDocumentId)),
  );
  const names: ClaimSourceName[] = [];
  for (const id of ids) {
    const document = getDocument(id);
    if (document === null) continue;
    names.push({
      sourceDocumentId: id,
      name: lastSegmentOf(document.documentPath),
      rootName: lastSegmentOf(document.folderPath),
    });
  }
  return names;
}
