// 選取器選到的單一檔案：安全讀進記憶體（ADR-0003、R7）。完整路徑不離開 sources。
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';

import { PickerError } from './osascript.ts';

const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/** 選取器輸出必須恰好一行、以 / 開頭、不以 / 結尾（不是資料夾）。 */
export function parseSingleFileOutput(output: string): string {
  const valid =
    output.startsWith('/') &&
    !output.endsWith('/') &&
    !output.includes('\n') &&
    !output.includes('\0');
  if (!valid) throw new PickerError('bad_output');
  return output;
}

/**
 * 讀選到的檔案：必須是絕對路徑、不跟隨符號連結、必須是一般檔案、大小在上限內（超過不讀進記憶體）。
 * 讀取中檔案變大就整份不採用。失敗一律丟 PickerError（不帶原始訊息）。
 */
export async function readPickedFile(absolutePath: string, maxBytes: number): Promise<Uint8Array> {
  if (!path.isAbsolute(absolutePath)) throw new PickerError('bad_output');
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
    return new Uint8Array(buffer.subarray(0, total));
  } catch (error) {
    if (error instanceof PickerError) throw error;
    throw new PickerError('not_file');
  } finally {
    await handle.close();
  }
}
