// macOS 原生單一 PDF 選取器（ADR-0003、F02）：選檔與讀檔都在 sources 內完成，
// 只回檔名（不含上層路徑）與內容；完整路徑不離開本模組（R7）。使用者取消回 null。
import path from 'node:path';
import process from 'node:process';

import type { PickerDeps } from './folder-picker.ts';
import { defaultExecFile, PickerError, runAppleScript } from './osascript.ts';
import { parseSingleFileOutput, readPickedFile } from './read-picked.ts';

/** 履歷 PDF 大小上限：一般履歷遠小於此；超過就拒絕，不讀進記憶體。 */
export const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;

/** PDF 檔頭可出現在前 1024 位元組內（常見閱讀器的容忍範圍）。 */
const HEADER_WINDOW = 1024;
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

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
export const parsePdfOutput = parseSingleFileOutput;

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
  const bytes = await readPickedFile(absolutePath, maxBytes);
  if (!hasPdfHeader(bytes)) throw new PickerError('not_pdf');
  return { fileName, bytes };
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
