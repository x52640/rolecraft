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
const hasDrive = (value: string) => /^[A-Za-z]:/u.test(value);

/**
 * 授權資料夾正規化後的段落；無效（空、相對起點、`..` 超出起點）回傳 null。
 * POSIX 根目錄 `/` 正規化後是空陣列，但是合法的資料夾（磁碟根 `C:\` 本來就有一段 `C:`）。
 */
function folderSegments(folderPath: string): string[] | null {
  const folder = normalizedSegments(folderPath);
  if (folder === null) return null;
  if (folder.length > 0) return folder;
  return /^[/\\]/u.test(folderPath) ? folder : null;
}

/**
 * 正規化成原樣的路徑段（不修剪、不截斷，判斷位置用）：去掉空段與 `.`，`..` 往上一段。
 * 往上超出起點時回傳 null（無法確定位置）。
 */
function normalizedSegments(value: string): string[] | null {
  const out: string[] = [];
  for (const part of value.split(/[/\\]/u)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.pop() === undefined) return null;
    } else out.push(part);
  }
  return out;
}

/**
 * 文件在授權資料夾內的相對路徑（以 `/` 連接；資料夾是根目錄 `/` 時同樣適用）。先用正規化、未清理的完整路徑判斷是否在資料夾內
 * （相對路徑視為相對於資料夾），在內才去掉資料夾前綴；不在內只給原始路徑最後一段（是 `.`／`..` 就不給），不洩漏資料夾外的目錄名。
 * 判斷完才對結果做顯示用清理；段數過多時只留最後幾段、前面以「…」表示。
 */
export function relativeNameOf(documentPath: string, folderPath: string): string {
  const folder = folderSegments(folderPath);
  const full = normalizedSegments(
    isAbsolute(documentPath) ? documentPath : `${folderPath}/${documentPath}`,
  );
  // POSIX 根目錄下不收磁碟路徑（`C:\…` 不在 `/` 內）
  const driveMismatch = folder?.length === 0 && hasDrive(documentPath);
  const inside =
    folder !== null &&
    full !== null &&
    !driveMismatch &&
    full.length > folder.length &&
    folder.every((part, i) => full[i] === part);
  let segments =
    inside && full !== null
      ? segmentsOf(full.slice(folder.length).join('/'))
      : segmentsOf(documentPath.split(/[/\\]/u).at(-1) ?? '');
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
