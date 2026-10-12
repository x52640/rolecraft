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

const isSofMarker = (m: number): boolean =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** 不帶長度的標記：RST0–7、TEM。只占 2 位元組（P1-T083 對抗審查：不能讀長度往後跳）。 */
const isStandaloneMarker = (m: number): boolean => (m >= 0xd0 && m <= 0xd7) || m === 0x01;

/** 掃描開始前可出現、帶長度的段落：APPn、COM、DQT、DHT、DAC、DRI。 */
const isKnownSegment = (m: number): boolean =>
  (m >= 0xe0 && m <= 0xef) || m === 0xfe || m === 0xdb || m === 0xc4 || m === 0xcc || m === 0xdd;

/**
 * 走到第一個 SOS，讀唯一的 SOFn 尺寸。不帶長度的標記只前進 2 位元組；
 * 第二個 SOF、不認得的標記、SOS 前沒有 SOF、結構截斷都拒絕（不猜，避免與解碼器看到的尺寸不同）。
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  const malformed = () => new PhotoProcessError('undecodable', 'JPEG 結構不正確');
  let size: { width: number; height: number } | null = null;
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) throw malformed();
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // 填充用的連續 FF
      continue;
    }
    if (isStandaloneMarker(marker)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      if (!size) throw malformed();
      return size;
    }
    const length = u16(bytes, i + 2);
    if (length < 2 || i + 2 + length > bytes.length) throw malformed();
    if (isSofMarker(marker)) {
      if (size || length < 8) throw malformed();
      size = { height: u16(bytes, i + 5), width: u16(bytes, i + 7) };
    } else if (!isKnownSegment(marker)) {
      throw malformed();
    }
    i += 2 + length;
  }
  throw malformed();
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
