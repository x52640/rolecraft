/** 測試用小字型（見 fonts/NOTICE.txt）。 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { FontSet } from '../fonts/font-set.ts';

const dir = path.join(import.meta.dirname, 'fonts');

export function loadFixtureFonts(): FontSet {
  return {
    regular: new Uint8Array(readFileSync(path.join(dir, 'fixture-regular.ttf'))),
    bold: new Uint8Array(readFileSync(path.join(dir, 'fixture-bold.ttf'))),
  };
}
