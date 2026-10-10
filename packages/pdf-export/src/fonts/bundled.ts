/**
 * 從本機資料夾載入隨附字型並驗證（sha256 必須與 manifest 相同；必須是靜態 TrueType）。
 * 字型資料夾由 helper／安裝包決定，本套件不假設位置。
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PdfExportError } from '../errors.ts';

import { describeFont, type FontSet } from './font-set.ts';
import {
  NOTO_SANS_TC_BOLD,
  NOTO_SANS_TC_LICENSE,
  NOTO_SANS_TC_REGULAR,
  type BundledFontFile,
} from './manifest.ts';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readVerified(dir: string, file: BundledFontFile): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path.join(dir, file.fileName)));
  } catch (cause) {
    throw new PdfExportError('fonts_unavailable', `找不到字型檔 ${file.fileName}。`, { cause });
  }
  if (sha256Hex(bytes) !== file.sha256) {
    throw new PdfExportError(
      'fonts_unavailable',
      `字型檔 ${file.fileName} 的雜湊與預期不同，拒絕使用。`,
    );
  }
  return bytes;
}

/** 檢查字型是否是 Chrome 能正常內嵌的靜態 TrueType（ADR-0005 發現 3）。 */
export function assertStaticTrueType(bytes: Uint8Array, label: string): void {
  const info = describeFont(bytes);
  if (!info.trueTypeOutlines || info.variable) {
    throw new PdfExportError(
      'fonts_unavailable',
      `${label} 不是靜態 TrueType 字型（CFF 或可變字重在 Chrome 會變成 Type3）。`,
    );
  }
}

/** 載入 Noto Sans TC 400／700；授權檔也必須在同一資料夾。 */
export async function loadBundledFonts(dir: string): Promise<FontSet> {
  const [regular, bold] = await Promise.all([
    readVerified(dir, NOTO_SANS_TC_REGULAR),
    readVerified(dir, NOTO_SANS_TC_BOLD),
    readVerified(dir, NOTO_SANS_TC_LICENSE),
  ]);
  assertStaticTrueType(regular, NOTO_SANS_TC_REGULAR.fileName);
  assertStaticTrueType(bold, NOTO_SANS_TC_BOLD.fileName);
  return { regular, bold };
}
