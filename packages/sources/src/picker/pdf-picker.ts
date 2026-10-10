// macOS 原生單一 PDF 選取器（ADR-0003、F02）：選檔與讀檔都在 sources 內完成，
// 只回檔名（不含上層路徑）與內容；完整路徑不離開本模組（R7）。使用者取消回 null。
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { PickerDeps } from './folder-picker.ts';
import { defaultExecFile, PickerError, runAppleScript } from './osascript.ts';

/** 履歷 PDF 大小上限：一般履歷遠小於此；超過就拒絕，不讀進記憶體。 */
export const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;

/** PDF 檔頭可出現在前 1024 位元組內（常見閱讀器的容忍範圍）。 */
const HEADER_WINDOW = 1024;
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/** 寫死的腳本：只能選 PDF 類型的單一檔案。 */
export const PDF_SCRIPT: readonly string[] = [
  'set picked to choose file with prompt "選擇履歷 PDF" of type {"com.adobe.pdf"}',
  'return POSIX path of picked',
];

export interface PickedPdfFile {
  /** 只有檔名，不含上層路徑。 */
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface PdfPickerDeps extends PickerDeps {
  readonly maxBytes?: number;
}

/** 輸出必須恰好一行、以 / 開頭、不以 / 結尾（不是資料夾）。 */
export function parsePdfOutput(output: string): string {
  const valid =
    output.startsWith('/') &&
    !output.endsWith('/') &&
    !output.includes('\n') &&
    !output.includes('\0');
  if (!valid) throw new PickerError('bad_output');
  return output;
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  return (
    Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, HEADER_WINDOW)).indexOf(
      PDF_MAGIC,
    ) !== -1
  );
}

/**
 * 讀使用者選的 PDF：不跟隨符號連結、必須是一般檔案、副檔名 .pdf、大小在上限內、
 * 前 1024 位元組內有 %PDF- 檔頭。讀取中檔案變大就不採用。
 */
export async function readPickedPdf(
  absolutePath: string,
  maxBytes: number,
): Promise<PickedPdfFile> {
  if (!path.isAbsolute(absolutePath)) throw new PickerError('bad_output');
  const fileName = path.basename(absolutePath);
  if (path.extname(fileName).toLowerCase() !== '.pdf') throw new PickerError('not_pdf');
  let handle;
  try {
    handle = await open(absolutePath, OPEN_FLAGS);
  } catch {
    throw new PickerError('not_file');
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new PickerError('not_file');
    if (stat.size > maxBytes) throw new PickerError('too_large');
    // 多留 1 位元組：讀到比 stat 大，代表讀取中檔案被改，整份不採用。
    const buffer = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > stat.size) throw new PickerError('not_file');
    const bytes = new Uint8Array(buffer.subarray(0, total));
    if (!hasPdfHeader(bytes)) throw new PickerError('not_pdf');
    return { fileName, bytes };
  } catch (error) {
    if (error instanceof PickerError) throw error;
    throw new PickerError('not_file');
  } finally {
    await handle.close();
  }
}

/** 建立 PDF 選取器；不接受任何參數，每次呼叫都執行同一份腳本。 */
export function createMacPdfPicker(deps: PdfPickerDeps = {}): () => Promise<PickedPdfFile | null> {
  const exec = deps.execFile ?? defaultExecFile;
  const platform = deps.platform ?? process.platform;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_PDF_BYTES;
  return async () => {
    const output = await runAppleScript(PDF_SCRIPT, exec, platform);
    if (output === null) return null;
    return readPickedPdf(parsePdfOutput(output), maxBytes);
  };
}
