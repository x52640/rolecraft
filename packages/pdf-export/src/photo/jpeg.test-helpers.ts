// 測試用合成 JPEG／PNG（內容去識別化）：可塞入 EXIF／GPS、XMP、ICC、IPTC、註解與 EOI 後資料。
import { crc32, deflateSync } from 'node:zlib';

/** 合成 GPS 與裝置字樣：結果裡只要出現任何一個就代表中繼資料沒清乾淨。 */
export const GPS_MARKER = 'RC-GPS-25.0330N-121.5654E';
export const DEVICE_MARKER = 'RC-DEVICE-SyntheticCam';

export function segment(marker: number, payload: Uint8Array | number[] | string): Uint8Array {
  const body =
    typeof payload === 'string' ? new TextEncoder().encode(payload) : Uint8Array.from(payload);
  const length = body.length + 2;
  return Uint8Array.from([0xff, marker, length >> 8, length & 0xff, ...body]);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** 最小 JFIF APP0（沒有內嵌縮圖）。 */
export const JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

/** APP1 EXIF：含合成 GPS 與裝置字樣。 */
export const EXIF_GPS = segment(
  0xe1,
  `Exif\0\0II*\0\x08\0\0\0GPSLatitude ${GPS_MARKER} Make ${DEVICE_MARKER}`,
);

/** 各種中繼資料段：XMP（APP1）、ICC（APP2）、IPTC（APP13）、Adobe（APP14）、註解（COM）。 */
export const OTHER_METADATA = [
  segment(0xe1, `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>${GPS_MARKER}</x:xmpmeta>`),
  segment(0xe2, `ICC_PROFILE\0\x01\x01${DEVICE_MARKER}`),
  segment(0xed, `Photoshop 3.0\0${GPS_MARKER}`),
  segment(0xee, 'Adobe\0\x64\0\0\0\0\x01'),
  segment(0xfe, `comment ${DEVICE_MARKER}`),
];

export interface JpegOptions {
  readonly width: number;
  readonly height: number;
  /** 插在 SOI 之後的段落 */
  readonly extra?: readonly Uint8Array[];
  /** 是否有 JFIF APP0 */
  readonly jfif?: boolean;
  /** EOI 後的資料 */
  readonly trailing?: string;
  /** 漸進式：兩次掃描，中間夾的段落 */
  readonly betweenScans?: readonly Uint8Array[];
}

const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const DHT = segment(0xc4, [0x00, 1, ...Array.from({ length: 15 }, () => 0), 0]);
const SOS = segment(0xda, [1, 1, 0x00, 0, 63, 0]);
/** 壓縮資料：含 FF 00 填充與 RST 標記（屬於壓縮資料，不是段落）。 */
const SCAN = Uint8Array.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);

/** 結構正確的 JPEG（解析器用；不保證真的能解碼成圖）。 */
export function makeJpeg(options: JpegOptions): Uint8Array {
  const { width, height } = options;
  const sof = segment(0xc0, [
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ]);
  const scans = options.betweenScans
    ? [SOS, SCAN, ...options.betweenScans, SOS, SCAN]
    : [SOS, SCAN];
  return concat(
    Uint8Array.from([0xff, 0xd8]),
    ...(options.jfif === false ? [] : [JFIF]),
    ...(options.extra ?? []),
    DQT,
    sof,
    DHT,
    ...scans,
    Uint8Array.from([0xff, 0xd9]),
    new TextEncoder().encode(options.trailing ?? ''),
  );
}

/**
 * 對抗審查重現（P1-T083）：SOI 後插一個不帶長度的標記（RST0 `FFD0` 或 TEM `FF01`），
 * 誤把它當帶長度段落的解析器會讀下一段的標記當長度往後跳；在跳到的位置（真 EOI 之後）放假的 SOF。
 * 解碼器（libjpeg／Chrome）只把它當 2 位元組標記，看到的是真的 SOF。
 */
export function smuggleFakeSof(
  real: Uint8Array,
  fake: { width: number; height: number },
  standalone = 0xd0,
): Uint8Array {
  const head = concat(Uint8Array.from([0xff, 0xd8, 0xff, standalone]), real.subarray(2));
  const landing = 4 + (((head[4] ?? 0) << 8) | (head[5] ?? 0));
  const { width, height } = fake;
  const sof = segment(0xc0, [
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ]);
  return concat(
    head,
    new Uint8Array(Math.max(0, landing - head.length)),
    sof,
    Uint8Array.from([0xff, 0xd9]),
  );
}

/** 位元組裡是否出現某段文字（latin1 比對）。 */
export function containsText(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text, 'utf8'));
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return concat(head, data, crc);
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ihdr(width: number, height: number): Uint8Array {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.set([8, 2, 0, 0, 0], 8);
  return pngChunk('IHDR', data);
}

/** 真的能解碼的 PNG（RGB、左右兩色），預設塞 tEXt（GPS 字樣）與 eXIf（裝置字樣）中繼資料區塊。 */
export function makePng(width: number, height: number, withMetadata = true): Uint8Array {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row.set(x < width / 2 ? [200, 60, 40] : [30, 90, 210], 1 + x * 3);
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const metadata = withMetadata
    ? [
        pngChunk('tEXt', Buffer.from(`GPS\0${GPS_MARKER}`, 'latin1')),
        pngChunk('eXIf', Buffer.from(`MM\0*${DEVICE_MARKER}`, 'latin1')),
      ]
    : [];
  return concat(
    PNG_SIGNATURE,
    ihdr(width, height),
    ...metadata,
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array()),
  );
}

/** 只有檔頭的 PNG（宣告尺寸，沒有像素）：給尺寸／像素上限檢查用。 */
export function pngHeaderOnly(width: number, height: number): Uint8Array {
  return concat(PNG_SIGNATURE, ihdr(width, height));
}
