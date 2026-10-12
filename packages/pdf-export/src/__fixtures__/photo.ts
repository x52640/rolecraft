/**
 * 測試用合成照片（photo.jpg）：程式畫的 90×120 色塊（不是真人照片），已去掉 Exif 等 APP 區段。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { TemplatePhoto } from '../model.ts';

export const FIXTURE_PHOTO_PATH = path.join(import.meta.dirname, 'photo.jpg');

export function loadFixturePhoto(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PHOTO_PATH));
}

export function fixturePhoto(): TemplatePhoto {
  return {
    dataUri: `data:image/jpeg;base64,${Buffer.from(loadFixturePhoto()).toString('base64')}`,
  };
}
