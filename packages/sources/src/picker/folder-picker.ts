// macOS 原生資料夾選取器（ADR-0003、F03 可複選）：回使用者選的絕對路徑，取消回空陣列。
// 路徑只給 helper 的 sources 服務登記用，不得出現在任何橋接回應（R7）。
import process from 'node:process';

import { defaultExecFile, PickerError, runAppleScript, type ExecFileRunner } from './osascript.ts';

/** 寫死的腳本：第一行是選了幾個，之後每行一個 POSIX 路徑（資料夾一定以 / 結尾）。 */
export const FOLDER_SCRIPT: readonly string[] = [
  'set picked to choose folder with prompt "選擇要匯入的專案資料夾（可複選）" with multiple selections allowed',
  'set out to (count of picked) as text',
  'repeat with f in picked',
  'set out to out & linefeed & (POSIX path of f)',
  'end repeat',
  'return out',
];

export interface PickerDeps {
  /** 測試注入假的；預設為 osascript.ts 的 defaultExecFile（不經 shell）。 */
  readonly execFile?: ExecFileRunner;
  /** 測試用；預設 process.platform。 */
  readonly platform?: NodeJS.Platform;
}

/**
 * 解析輸出：數量行必須等於路徑行數，每行都是以 / 開頭、/ 結尾的絕對路徑。
 * 不符（例如資料夾名稱含換行把一行拆成兩行）就整批不採用，不猜。
 */
export function parseFolderOutput(output: string): string[] {
  const [countLine = '', ...paths] = output.split('\n');
  if (!/^[1-9]\d{0,5}$/u.test(countLine) || Number(countLine) !== paths.length) {
    throw new PickerError('bad_output');
  }
  const valid = paths.every(
    (p) => p.length > 1 && p.startsWith('/') && p.endsWith('/') && !p.includes('\0'),
  );
  if (!valid) throw new PickerError('bad_output');
  return paths;
}

/** 建立資料夾選取器；不接受任何參數，每次呼叫都執行同一份腳本。 */
export function createMacFolderPicker(deps: PickerDeps = {}): () => Promise<string[]> {
  const exec = deps.execFile ?? defaultExecFile;
  const platform = deps.platform ?? process.platform;
  return async () => {
    const output = await runAppleScript(FOLDER_SCRIPT, exec, platform);
    return output === null ? [] : parseFolderOutput(output);
  };
}
