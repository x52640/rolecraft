/**
 * 相對路徑格式檢查。不論列舉來源是本機 fs 或瀏覽器，
 * registry 只接受「乾淨」的相對路徑：`/` 分隔、無空段、無 `.`／`..`、
 * 非絕對路徑、無反斜線與控制字元。
 */

// eslint-disable-next-line no-control-regex -- 刻意比對控制字元
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function splitRelPath(relPath: string): string[] | null {
  if (relPath.length === 0 || relPath.length > 1024) return null;
  if (relPath.startsWith('/') || relPath.includes('\\')) return null;
  if (/^[a-zA-Z]:/.test(relPath)) return null;
  if (CONTROL_CHARS.test(relPath)) return null;
  const segments = relPath.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') return null;
  }
  return segments;
}

export function isValidRelPath(relPath: string): boolean {
  return splitRelPath(relPath) !== null;
}

/** relPath 是否位於 dirRelPath（同為乾淨相對路徑）底下或就是它本身。 */
export function isUnderDir(relPath: string, dirRelPath: string): boolean {
  return relPath === dirRelPath || relPath.startsWith(`${dirRelPath}/`);
}
