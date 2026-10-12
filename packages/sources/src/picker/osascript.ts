// macOS 原生選取器的共用執行層（ADR-0003、R7）：只執行寫死的 AppleScript。
// 指令固定為 /usr/bin/osascript、參數只有寫死的 -e 腳本行；不經 shell、不帶任何請求內容。
import { execFile } from 'node:child_process';

import { PICKER_DIALOG_TIMEOUT_MS } from '@rolecraft/contracts';

/** osascript 絕對路徑：不靠 PATH 找（從 Dock 啟動的瀏覽器 PATH 不可信）。 */
export const OSASCRIPT = '/usr/bin/osascript';

/** 對話框最長等待時間：取自 contracts，橋接客戶端的選取器逾時以它為基準再加餘裕（P1-T045）。 */
export const DIALOG_TIMEOUT_MS = PICKER_DIALOG_TIMEOUT_MS;

const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface ExecFileOptions {
  readonly timeout: number;
  readonly maxBuffer: number;
  readonly shell: false;
  readonly windowsHide: true;
}

/** 執行固定檔案、固定參數；成功回 stdout，失敗拒絕（錯誤物件可帶 stderr）。測試注入假的。 */
export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
) => Promise<string>;

export type PickerFailure =
  | 'not_macos' // 不是 macOS（D11：其他平台另做）
  | 'dialog_failed' // osascript 失敗（不是使用者取消）
  | 'bad_output' // 輸出格式不符預期（例如路徑含換行），整批不採用
  | 'not_file' // 選到的不是一般檔案（或是符號連結）
  | 'not_pdf' // 副檔名或檔頭不是 PDF
  | 'not_image' // 副檔名或檔頭不是 JPEG／PNG（照片選取器，D28）
  | 'too_large'; // 超過大小上限

/** 選取器失敗；訊息是固定文字，不含路徑或輸出內容。 */
export class PickerError extends Error {
  override readonly name = 'PickerError';
  readonly reason: PickerFailure;

  constructor(reason: PickerFailure) {
    super(`系統選取器失敗：${reason}`);
    this.reason = reason;
  }
}

export const defaultExecFile: ExecFileRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const failure: Error = Object.assign(error, { stderr });
        reject(failure);
        return;
      }
      resolve(stdout);
    });
  });

/** 使用者按取消：AppleScript 錯誤 -128（User canceled）。 */
function isUserCancel(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const texts = [
    'stderr' in error ? error.stderr : undefined,
    'message' in error ? error.message : undefined,
  ];
  return texts.some((text) => typeof text === 'string' && /\(-128\)/u.test(text));
}

/**
 * 每行一個 -e 參數執行寫死的腳本。使用者取消回 null；其他失敗丟 PickerError（不帶原始訊息）。
 * 回傳的 stdout 去掉 osascript 結尾補上的一個換行，其餘原樣（不 trim，名稱可能有前後空白）。
 */
export async function runAppleScript(
  lines: readonly string[],
  run: ExecFileRunner,
  platform: NodeJS.Platform,
): Promise<string | null> {
  if (platform !== 'darwin') throw new PickerError('not_macos');
  const args = lines.flatMap((line) => ['-e', line]);
  let stdout: string;
  try {
    stdout = await run(OSASCRIPT, args, {
      timeout: DIALOG_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: false,
      windowsHide: true,
    });
  } catch (error) {
    if (isUserCancel(error)) return null;
    throw new PickerError('dialog_failed');
  }
  if (typeof stdout !== 'string') throw new PickerError('bad_output');
  return stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
}
