import { describe, expect, it } from 'vitest';

import { PhotoProcessError } from './errors.ts';
import { inspectJpeg, metadataProblems, stripJpegMetadata } from './jpeg.ts';
import {
  concat,
  containsText,
  DEVICE_MARKER,
  EXIF_GPS,
  GPS_MARKER,
  makeJpeg,
  OTHER_METADATA,
  segment,
} from './jpeg.test-helpers.ts';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof PhotoProcessError ? error.code : 'other';
  }
  return undefined;
};

describe('inspectJpeg', () => {
  it('讀出尺寸與段落；壓縮資料裡的 FF 00、RST 不當段落', () => {
    const info = inspectJpeg(makeJpeg({ width: 640, height: 480 }));
    expect(info).toMatchObject({ width: 640, height: 480, trailingBytes: 0 });
    expect(info.segments.map((s) => s.marker.toString(16))).toEqual([
      'd8',
      'e0',
      'db',
      'c0',
      'c4',
      'da',
      'd9',
    ]);
  });

  it('結構不正確：undecodable', () => {
    const good = makeJpeg({ width: 10, height: 10 });
    expect(codeOf(() => inspectJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])))).toBe(
      'undecodable',
    );
    expect(codeOf(() => inspectJpeg(good.subarray(0, good.length - 2)))).toBe('undecodable');
    expect(codeOf(() => inspectJpeg(good.subarray(0, 30)))).toBe('undecodable');
    const noSof = concat(Uint8Array.from([0xff, 0xd8]), Uint8Array.from([0xff, 0xd9]));
    expect(codeOf(() => inspectJpeg(noSof))).toBe('undecodable');
  });
});

describe('stripJpegMetadata', () => {
  const dirty = makeJpeg({
    width: 800,
    height: 1200,
    extra: [EXIF_GPS, ...OTHER_METADATA],
    betweenScans: [segment(0xe1, `Exif\0\0${GPS_MARKER}`), segment(0xfe, DEVICE_MARKER)],
    trailing: `tail ${GPS_MARKER}`,
  });

  it('原始檔確實帶中繼資料（前提）', () => {
    expect(containsText(dirty, GPS_MARKER)).toBe(true);
    expect(metadataProblems(dirty)).toEqual(
      expect.arrayContaining([
        'marker_0xe1',
        'marker_0xe2',
        'marker_0xed',
        'marker_0xfe',
        'trailing_bytes',
      ]),
    );
  });

  it('清除後：沒有任何 APPn（最小 JFIF 除外）、COM、EOI 後資料，也找不到 GPS／裝置字樣', () => {
    const clean = stripJpegMetadata(dirty);
    expect(metadataProblems(clean)).toEqual([]);
    expect(containsText(clean, GPS_MARKER)).toBe(false);
    expect(containsText(clean, DEVICE_MARKER)).toBe(false);
    expect(containsText(clean, 'Exif')).toBe(false);
    const info = inspectJpeg(clean);
    expect(info).toMatchObject({ width: 800, height: 1200, trailingBytes: 0 });
    expect(info.segments.filter((s) => s.marker >= 0xe0 && s.marker <= 0xef)).toHaveLength(1);
  });

  it('帶內嵌縮圖的 JFIF APP0 也拿掉；沒有 JFIF 也可以', () => {
    const thumbJfif = segment(
      0xe0,
      [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 9, 9, 9],
    );
    const clean = stripJpegMetadata(
      makeJpeg({ width: 5, height: 5, jfif: false, extra: [thumbJfif] }),
    );
    expect(metadataProblems(clean)).toEqual([]);
    expect(inspectJpeg(clean).segments.some((s) => s.marker === 0xe0)).toBe(false);
  });

  it('不認得的段落：拒絕，不猜', () => {
    const odd = makeJpeg({ width: 5, height: 5, extra: [segment(0xf0, 'JPG0')] });
    expect(metadataProblems(odd)).toContain('unknown_0xf0');
    expect(codeOf(() => stripJpegMetadata(odd))).toBe('undecodable');
  });

  it('已乾淨的照片：清除後位元組不變', () => {
    const clean = makeJpeg({ width: 30, height: 20 });
    expect(stripJpegMetadata(clean)).toEqual(clean);
  });
});
