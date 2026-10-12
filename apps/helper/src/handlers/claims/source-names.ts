// 事實項來源文件的顯示名稱（P1-T073）：檔名是授權資料夾內的相對路徑，資料夾只給名稱最後一段；
// 授權資料夾以上的路徑一律不出現（R7）。
import type { Claim, ClaimSourceName, SourceDocument } from '@rolecraft/contracts';

const SEGMENT_MAX_CHARS = 100;
const MAX_SEGMENTS = 8;
const UNNAMED = '（未命名）';

/** 一段名稱：控制字元換成空白，去頭尾空白，過長截斷。 */
function cleanSegment(segment: string): string {
  // eslint-disable-next-line no-control-regex -- 刻意比對控制字元
  const clean = segment.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim();
  return [...clean].slice(0, SEGMENT_MAX_CHARS).join('');
}

/** 路徑拆段：去掉空段、`.`、`..`（`..` 不往上走，直接丟掉）。 */
function segmentsOf(value: string): string[] {
  return value
    .split(/[/\\]/u)
    .map(cleanSegment)
    .filter((part) => part !== '' && part !== '.' && part !== '..');
}

/** 路徑的最後一段；空的給「（未命名）」。 */
export function lastSegmentOf(value: string): string {
  return segmentsOf(value).at(-1) ?? UNNAMED;
}

const isAbsolute = (value: string) => /^([/\\]|[A-Za-z]:)/u.test(value);

/**
 * 文件在授權資料夾內的相對路徑（以 `/` 連接）。documentPath 一般就是相對路徑；
 * 若是絕對路徑且在資料夾內就去掉資料夾前綴，不在資料夾內就只給最後一段（不洩漏上層路徑）。
 * 段數過多時只留最後幾段、前面以「…」表示。
 */
export function relativeNameOf(documentPath: string, folderPath: string): string {
  let segments: string[];
  if (isAbsolute(documentPath)) {
    const folder = segmentsOf(folderPath);
    const doc = segmentsOf(documentPath);
    const inside = folder.length > 0 && folder.every((part, i) => doc[i] === part);
    segments = inside ? doc.slice(folder.length) : doc.slice(-1);
  } else {
    segments = segmentsOf(documentPath);
  }
  if (segments.length === 0) return UNNAMED;
  if (segments.length > MAX_SEGMENTS) segments = ['…', ...segments.slice(-MAX_SEGMENTS)];
  return segments.join('/');
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
      name: relativeNameOf(document.documentPath, document.folderPath),
      rootName: lastSegmentOf(document.folderPath),
    });
  }
  return names;
}
