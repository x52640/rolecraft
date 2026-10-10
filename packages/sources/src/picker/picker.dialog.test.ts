/**
 * 真的開 macOS 對話框的手動測試，只在 RUN_PICKER=1 時跑（需要有人在螢幕前點選）。
 * 結果只印檔名／資料夾數，不印完整路徑。
 */
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createMacFolderPicker } from './folder-picker.ts';
import { createMacPdfPicker } from './pdf-picker.ts';

const MANUAL_TIMEOUT_MS = 6 * 60 * 1000;

describe.runIf(process.env.RUN_PICKER === '1')('真實系統選取器（RUN_PICKER=1）', () => {
  it(
    '資料夾：可複選，回絕對路徑；取消回空陣列',
    async () => {
      const picked = await createMacFolderPicker()();
      for (const p of picked) expect(p.startsWith('/')).toBe(true);
      console.log(`選了 ${picked.length} 個資料夾`);
    },
    MANUAL_TIMEOUT_MS,
  );

  it(
    'PDF：回檔名與內容；取消回 null',
    async () => {
      const picked = await createMacPdfPicker()();
      if (picked) {
        expect(picked.fileName).not.toContain('/');
        console.log(`選了 ${picked.fileName}（${picked.bytes.length} 位元組）`);
      } else {
        console.log('已取消');
      }
    },
    MANUAL_TIMEOUT_MS,
  );
});
