// macOS 原生照片選取器（D28；ADR-0003）：只能選單一 JPEG／PNG、10 MB 以下。
// 選檔與讀檔都在 sources 內完成，只回內容（連檔名都不回）；完整路徑不離開本模組（R7）。使用者取消回 null。
// 回傳的是未處理的原始檔：呼叫端必須重新編碼、去中繼資料後才能存（pdf-export createPhotoProcessor）。
import path from 'node:path';
import process from 'node:process';

import { PHOTO_SOURCE_MAX_BYTES } from '@rolecraft/contracts';

import type { PickerDeps } from './folder-picker.ts';
import { defaultExecFile, PickerError, runAppleScript } from './osascript.ts';
import { parseSingleFileOutput, readPickedFile } from './read-picked.ts';

/** 寫死的腳本：只能選 JPEG 或 PNG 類型的單一檔案。 */
export const PHOTO_SCRIPT: readonly string[] = [
  'set picked to choose file with prompt "選擇照片（JPEG／PNG）" of type {"public.jpeg", "public.png"}',
  'return POSIX path of picked',
];

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PickedPhotoFile {
  /** 原始內容（未處理，可能含 EXIF／GPS） */
  readonly bytes: Uint8Array;
}

export interface PhotoPickerDeps extends PickerDeps {
  readonly maxBytes?: number;
}

function hasImageHeader(bytes: Uint8Array): boolean {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return jpeg || PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

/** 讀使用者選的照片：副檔名 .jpg／.jpeg／.png、一般檔案、大小在上限內、檔頭是 JPEG 或 PNG。 */
export async function readPickedPhoto(
  absolutePath: string,
  maxBytes: number,
): Promise<PickedPhotoFile> {
  if (!path.isAbsolute(absolutePath)) throw new PickerError('bad_output');
  if (!EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
    throw new PickerError('not_image');
  }
  const bytes = await readPickedFile(absolutePath, maxBytes);
  if (!hasImageHeader(bytes)) throw new PickerError('not_image');
  return { bytes };
}

/** 建立照片選取器；不接受任何參數，每次呼叫都執行同一份腳本。 */
export function createMacPhotoPicker(
  deps: PhotoPickerDeps = {},
): () => Promise<PickedPhotoFile | null> {
  const exec = deps.execFile ?? defaultExecFile;
  const platform = deps.platform ?? process.platform;
  const maxBytes = deps.maxBytes ?? PHOTO_SOURCE_MAX_BYTES;
  return async () => {
    const output = await runAppleScript(PHOTO_SCRIPT, exec, platform);
    if (output === null) return null;
    return readPickedPhoto(parseSingleFileOutput(output), maxBytes);
  };
}
