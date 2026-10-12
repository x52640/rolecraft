/* global process */
// 開發用 harness 的 helper 入口（P1-T068）：只由 scripts/dev/harness.mjs 以子程序啟動。
// 與正式入口（apps/helper/src/main.ts）跑同一份 main()，差別只在選取器：
// 不開系統對話框，改回傳 harness 啟動參數指定的路徑（經同一套輸出解析與讀檔檢查）。
// 正式入口不讀 HARNESS_PICKS_ENV；只有本檔讀，所以正式 helper 沒有任何方式開啟這個行為。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createMacFolderPicker, createMacPdfPicker } from '@rolecraft/sources';

import { main } from '../../apps/helper/src/main.ts';

/** harness 傳給本入口的預設選取結果（JSON：{ pdf: string|null, folders: string[] }）。 */
export const HARNESS_PICKS_ENV = 'ROLECRAFT_HARNESS_PICKS';

export const HARNESS_HELPER_ENTRY = fileURLToPath(import.meta.url);

/** 與 packages/sources/src/picker/osascript.ts 的 OSASCRIPT 相同（只核對，不執行）。 */
const OSASCRIPT = '/usr/bin/osascript';

/** 使用者按取消時 osascript 的錯誤形狀（AppleScript -128）。 */
function cancelled() {
  return Object.assign(new Error('User canceled. (-128)'), { stderr: 'User canceled. (-128)' });
}

/**
 * 假的 osascript 執行器：不執行任何程式，直接回固定輸出；沒有預設值時等同使用者取消。
 * 輸出格式與 packages/sources/src/picker 的寫死腳本相同，交給原本的解析與讀檔檢查。
 */
export function presetExecFile(output) {
  return async (file) => {
    if (file !== OSASCRIPT) throw new Error('harness 選取器只模擬 osascript');
    if (output === null) throw cancelled();
    return `${output}\n`;
  };
}

/** 資料夾輸出：第一行數量，之後每行一個以 / 結尾的絕對路徑。 */
export function folderOutput(folders) {
  if (folders.length === 0) return null;
  const lines = folders.map((folder) => (folder.endsWith('/') ? folder : `${folder}/`));
  return [String(lines.length), ...lines].join('\n');
}

/** 解析 HARNESS_PICKS_ENV；格式不對就丟錯（harness 啟動失敗，不猜）。 */
export function parsePicks(raw) {
  const value = JSON.parse(raw ?? '{}');
  const pdf = value.pdf ?? null;
  const folders = value.folders ?? [];
  const absolute = (p) => typeof p === 'string' && path.isAbsolute(p);
  if (!(pdf === null || absolute(pdf)) || !Array.isArray(folders) || !folders.every(absolute)) {
    throw new Error(`${HARNESS_PICKS_ENV} 格式不符`);
  }
  return { pdf, folders };
}

/** 依預設路徑建立選取器；回傳形狀同 apps/helper/src/main.ts 的 NativePickers。 */
export function presetPickers({ pdf, folders }) {
  return {
    folder: createMacFolderPicker({
      execFile: presetExecFile(folderOutput(folders)),
      platform: 'darwin',
    }),
    pdf: createMacPdfPicker({ execFile: presetExecFile(pdf), platform: 'darwin' }),
  };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const picks = parsePicks(process.env[HARNESS_PICKS_ENV]);
  main({ pickers: () => presetPickers(picks) });
}
