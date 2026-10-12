/**
 * JPEG 段落解析與中繼資料清除（D28：照片去掉 EXIF、GPS、裝置等全部中繼資料）。
 * 純函式，不靠編碼器：Chrome 重新編碼後一律再過 stripJpegMetadata，再用 inspectJpeg 驗證結果，
 * 存下的位元組只剩影像必要段落（SOI、DQT、SOFn、DHT、DRI、SOS＋壓縮資料、EOI）與最小 JFIF APP0。
 */
import { PhotoProcessError } from './errors.ts';

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;

/** 影像必要、可以保留的段落（不含 APPn、COM 與其他擴充段）。 */
const IMAGE_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf, // SOFn
  0xc4, // DHT
  0xcc, // DAC
  0xdb, // DQT
  0xdd, // DRI
  0xdc, // DNL
]);

/** 中繼資料段：APP0–APP15、COM。 */
function isMetadataMarker(marker: number): boolean {
  return (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
}

/** SOFn（不含 DHT C4、JPG C8、DAC CC）。 */
function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export interface JpegSegment {
  readonly marker: number;
  /** 整段（含 FF 標記與長度）在原始位元組中的起訖 */
  readonly start: number;
  readonly end: number;
}

export interface JpegInfo {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly JpegSegment[];
  /** EOI 之後還有多少位元組（可能藏資料） */
  readonly trailingBytes: number;
}

function malformed(): PhotoProcessError {
  return new PhotoProcessError('undecodable', 'JPEG 結構不正確');
}

/** 從 SOS 段尾端往後跳過壓縮資料，回下一個標記的位置（FF 00 與 RSTn 屬於壓縮資料）。 */
function skipEntropy(bytes: Uint8Array, from: number): number {
  let i = from;
  while (i < bytes.length - 1) {
    if (bytes[i] === 0xff) {
      const next = bytes[i + 1] ?? 0;
      if (next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) return i;
    }
    i += 1;
  }
  throw malformed();
}

/** 解析全部段落（含多次掃描的漸進式 JPEG）；結構不正確丟 PhotoProcessError('undecodable')。 */
export function inspectJpeg(bytes: Uint8Array): JpegInfo {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) throw malformed();
  const segments: JpegSegment[] = [{ marker: SOI, start: 0, end: 2 }];
  let size: { width: number; height: number } | null = null;
  let i = 2;
  for (;;) {
    if (i + 1 >= bytes.length || bytes[i] !== 0xff) throw malformed();
    let marker = bytes[i + 1] ?? 0;
    let start = i;
    while (marker === 0xff) {
      // 填充用的連續 FF
      start += 1;
      marker = bytes[start + 1] ?? 0;
      if (start + 1 >= bytes.length) throw malformed();
    }
    if (marker === EOI) {
      segments.push({ marker, start, end: start + 2 });
      if (!size) throw malformed();
      return { ...size, segments, trailingBytes: bytes.length - (start + 2) };
    }
    if (marker === SOI || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) throw malformed();
    const length = ((bytes[start + 2] ?? 0) << 8) | (bytes[start + 3] ?? 0);
    const end = start + 2 + length;
    if (length < 2 || end > bytes.length) throw malformed();
    if (isSof(marker)) {
      if (length < 8) throw malformed();
      const height = ((bytes[start + 5] ?? 0) << 8) | (bytes[start + 6] ?? 0);
      const width = ((bytes[start + 7] ?? 0) << 8) | (bytes[start + 8] ?? 0);
      if (size || width === 0 || height === 0) throw malformed();
      size = { width, height };
    }
    if (marker === SOS) {
      const dataEnd = skipEntropy(bytes, end);
      segments.push({ marker, start, end: dataEnd });
      i = dataEnd;
    } else {
      segments.push({ marker, start, end });
      i = end;
    }
  }
}

/** 最小 JFIF APP0：只有版本、密度，沒有內嵌縮圖（長度 16、縮圖 0×0）。 */
function isMinimalJfif(bytes: Uint8Array, segment: JpegSegment): boolean {
  if (segment.marker !== APP0 || segment.end - segment.start !== 18) return false;
  const id = String.fromCharCode(...bytes.subarray(segment.start + 4, segment.start + 9));
  return id === 'JFIF\0' && bytes[segment.start + 16] === 0 && bytes[segment.start + 17] === 0;
}

/** 列出還留著的中繼資料段標記（APPn、COM；最小 JFIF 不算），以及 EOI 後是否有資料。 */
export function metadataProblems(bytes: Uint8Array): string[] {
  const info = inspectJpeg(bytes);
  const problems = info.segments
    .filter((s) => isMetadataMarker(s.marker) && !isMinimalJfif(bytes, s))
    .map((s) => `marker_0x${s.marker.toString(16)}`);
  const unknown = info.segments.filter(
    (s) =>
      !isMetadataMarker(s.marker) &&
      !IMAGE_MARKERS.has(s.marker) &&
      ![SOI, EOI, SOS].includes(s.marker),
  );
  problems.push(...unknown.map((s) => `unknown_0x${s.marker.toString(16)}`));
  if (info.trailingBytes > 0) problems.push('trailing_bytes');
  return problems;
}

/**
 * 重建 JPEG：只保留影像必要段落與最小 JFIF，去掉 APP1（EXIF／XMP，含 GPS 與裝置）、APP2（ICC）、
 * APP13（IPTC）等全部 APPn、COM，以及 EOI 後的資料。遇到不認得的段落拒絕（不猜）。
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const info = inspectJpeg(bytes);
  const kept: Uint8Array[] = [];
  for (const segment of info.segments) {
    const { marker } = segment;
    if (isMetadataMarker(marker)) {
      if (isMinimalJfif(bytes, segment)) kept.push(bytes.subarray(segment.start, segment.end));
      continue;
    }
    if (!IMAGE_MARKERS.has(marker) && ![SOI, EOI, SOS].includes(marker)) {
      throw new PhotoProcessError('undecodable', 'JPEG 含不認得的段落');
    }
    kept.push(bytes.subarray(segment.start, segment.end));
  }
  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
