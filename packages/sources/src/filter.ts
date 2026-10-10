/**
 * 文件篩選與優先序（F03、R4、D5）。純函式，只看相對路徑與大小。
 *
 * 採白名單：只有文字文件副檔名能成為候選；自訂檔名只影響優先序，
 * 不能把非文字文件類型加進來（R4 最後一條）。
 */
import { splitRelPath } from './path-rules.ts';
import type { EntryKind, ExclusionReason } from './types.ts';

/** 以空白分隔的字串轉清單，避免格式化後清單佔太多行。 */
function words(list: string): string[] {
  return list.split(/\s+/).filter((w) => w.length > 0);
}

/** 文字文件副檔名（小寫）。mdx 可內嵌程式碼，不列入。 */
const TEXT_DOC_EXTENSIONS = new Set(words('md markdown txt text rst adoc asciidoc org'));

/** 沒有副檔名但視為文字文件的檔名（小寫）。 */
const EXTENSIONLESS_DOCS = new Set(words('readme changelog todo plan agents claude'));

/** 常見原始碼／腳本／設定副檔名（小寫）；出現在檔名任一段都排除，擋 `main.py.txt` 這類偽裝。 */
const SOURCE_EXTENSIONS = new Set(
  words(
    'js mjs cjs jsx ts mts cts tsx py pyw rb go rs java kt kts scala swift m mm c h cc cpp ' +
      'cxx hpp cs fs php pl pm lua r dart ex exs erl hs clj sh bash zsh fish ps1 bat cmd sql ' +
      'vue svelte astro html htm css scss sass less json jsonc yaml yml toml ini cfg conf xml ' +
      'gradle mdx ipynb wasm so dylib dll exe class jar o a lock',
  ),
);

/** 憑證／金鑰類副檔名（小寫）。 */
const CREDENTIAL_EXTENSIONS = new Set(
  words('pem key p12 pfx crt cer der csr jks keystore kdbx gpg asc ppk ovpn mobileprovision env'),
);

/** 憑證類檔名片段（小寫、比對主檔名）。寧可誤擋，不可漏讀。 */
const CREDENTIAL_NAME_PARTS = words(
  'id_rsa id_dsa id_ecdsa id_ed25519 secret credential password passwd apikey api_key ' +
    'api-key private_key private-key privkey token htpasswd netrc npmrc pgpass keychain ' +
    'dotenv',
);

/** 相依、建置產物與快取資料夾（小寫比對）。隱藏資料夾另由 hidden 規則排除。 */
const EXCLUDED_DIRECTORIES = new Set(
  words(
    'node_modules bower_components jspm_packages vendor dist build out target coverage ' +
      '__pycache__ venv env site-packages pods deriveddata tmp temp bin obj logs',
  ),
);

export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

export interface FilterOptions {
  readonly maxFileBytes: number;
  /** 使用者自訂的優先檔名（不含副檔名、大小寫不敏感）；只提高優先序。 */
  readonly customNames: readonly string[];
}

export type Classification =
  | { readonly eligible: true; readonly priority: number }
  | { readonly eligible: false; readonly reason: ExclusionReason };

/** 依關鍵字給優先序，數字越小越優先（F03 優先文件）。 */
const PRIORITY_RULES: readonly (readonly [number, RegExp])[] = [
  [0, /^readme$/],
  [1, /^(claude|agents)$/],
  [2, /plan|計畫|計劃/],
  [3, /spec|規格|architecture|架構|design|設計|adr/],
  [4, /task|todo|待辦|任務/],
  [5, /changelog|history|progress|完成|紀錄|記錄|release/],
];
const CUSTOM_PRIORITY = 1;
const DEFAULT_PRIORITY = 9;

function splitName(basename: string): { stem: string; parts: string[] } {
  const parts = basename.toLowerCase().split('.');
  return { stem: parts[0] ?? '', parts };
}

function isCredentialName(lowerBase: string, parts: readonly string[]): boolean {
  if (parts.slice(1).some((p) => CREDENTIAL_EXTENSIONS.has(p))) return true;
  return CREDENTIAL_NAME_PARTS.some((frag) => lowerBase.includes(frag));
}

function priorityOf(stem: string, customNames: readonly string[]): number {
  if (customNames.some((n) => n.toLowerCase() === stem)) return CUSTOM_PRIORITY;
  for (const [priority, pattern] of PRIORITY_RULES) {
    if (pattern.test(stem)) return priority;
  }
  return DEFAULT_PRIORITY;
}

/** 單一檔名（不含目錄）是否為允許的文字文件類型；讀檔時也用它複查。 */
export function classifyName(basename: string): ExclusionReason | null {
  const lowerBase = basename.toLowerCase();
  if (lowerBase.startsWith('.')) return 'hidden';
  const { stem, parts } = splitName(basename);
  if (isCredentialName(lowerBase, parts)) return 'credential';
  if (parts.length === 1) return EXTENSIONLESS_DOCS.has(stem) ? null : 'not_text_document';
  const finalExt = parts[parts.length - 1] ?? '';
  const innerExts = parts.slice(1, -1);
  if (SOURCE_EXTENSIONS.has(finalExt) || innerExts.some((p) => SOURCE_EXTENSIONS.has(p))) {
    return 'source_code';
  }
  return TEXT_DOC_EXTENSIONS.has(finalExt) ? null : 'not_text_document';
}

/** 依相對路徑、種類、大小判定是否可成為候選文件。 */
export function classifyEntry(
  relPath: string,
  kind: EntryKind,
  size: number,
  options: FilterOptions,
): Classification {
  const segments = splitRelPath(relPath);
  if (!segments) return { eligible: false, reason: 'invalid_path' };
  const dirs = segments.slice(0, -1);
  const basename = segments[segments.length - 1] ?? '';
  for (const dir of dirs) {
    if (dir.startsWith('.')) return { eligible: false, reason: 'hidden' };
    if (EXCLUDED_DIRECTORIES.has(dir.toLowerCase())) {
      return { eligible: false, reason: 'excluded_directory' };
    }
  }
  if (kind === 'symlink') return { eligible: false, reason: 'symlink' };
  if (kind !== 'file') return { eligible: false, reason: 'not_regular_file' };
  const nameReason = classifyName(basename);
  if (nameReason) return { eligible: false, reason: nameReason };
  if (!Number.isFinite(size) || size < 0 || size > options.maxFileBytes) {
    return { eligible: false, reason: 'too_large' };
  }
  return { eligible: true, priority: priorityOf(splitName(basename).stem, options.customNames) };
}

/** 列舉時是否該進入這個資料夾（隱藏或排除清單內的不進入）。 */
export function shouldDescend(dirName: string): boolean {
  return !dirName.startsWith('.') && !EXCLUDED_DIRECTORIES.has(dirName.toLowerCase());
}

/** 內容是否像二進位（含 NUL 或不是合法 UTF-8）。 */
export function looksBinary(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return false;
  } catch {
    return true;
  }
}
