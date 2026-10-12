/**
 * 使用者選的原始照片：只認 JPEG／PNG 檔頭（不看副檔名），先讀出尺寸，
 * 像素數超過上限就拒絕，不交給 Chrome 解碼（避免小檔解壓成巨大影像）。
 */
import { PHOTO_SOURCE_MAX_BYTES } from '@rolecraft/contracts';

import { PhotoProcessError } from './errors.ts';

/** 原始照片像素上限：4800 萬畫素手機照片可過，再大就拒絕。 */
export const PHOTO_SOURCE_MAX_PIXELS = 80_000_000;

export type PhotoSourceFormat = 'jpeg' | 'png';

export interface PhotoSourceInfo {
  readonly format: PhotoSourceFormat;
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u16 = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32 = (b: Uint8Array, i: number): number => u16(b, i) * 0x10000 + u16(b, i + 2);

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
  if (bytes.length < 24 || ihdr !== 'IHDR') {
    throw new PhotoProcessError('undecodable', 'PNG 結構不正確');
  }
  return { width: u32(bytes, 16), height: u32(bytes, 20) };
}

/** 從檔頭往後找第一個 SOFn 讀尺寸（寬鬆：只走到 SOF，不檢查後面）。 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const length = u16(bytes, i + 2);
    if (length < 2) break;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 8 < bytes.length)
      return { height: u16(bytes, i + 5), width: u16(bytes, i + 7) };
    if (marker === 0xda || marker === 0xd9) break;
    i += 2 + length;
  }
  throw new PhotoProcessError('undecodable', 'JPEG 結構不正確');
}

/** 驗原始照片：大小、格式（檔頭）、尺寸與像素上限。 */
export function inspectPhotoSource(bytes: Uint8Array): PhotoSourceInfo {
  if (bytes.length > PHOTO_SOURCE_MAX_BYTES) {
    throw new PhotoProcessError('too_large', '照片超過 10 MB');
  }
  let format: PhotoSourceFormat;
  let size: { width: number; height: number };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    format = 'jpeg';
    size = jpegSize(bytes);
  } else if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    format = 'png';
    size = pngSize(bytes);
  } else {
    throw new PhotoProcessError('not_image', '照片只限 JPEG 或 PNG');
  }
  if (size.width === 0 || size.height === 0) {
    throw new PhotoProcessError('undecodable', '照片尺寸不正確');
  }
  if (size.width * size.height > PHOTO_SOURCE_MAX_PIXELS) {
    throw new PhotoProcessError('too_large', '照片像素過多');
  }
  return { format, ...size };
}
