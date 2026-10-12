// 照片服務測試用：合成 JPEG（結構正確、去識別化）與「會漏中繼資料」的假重繪器（不開 Chrome）。
import type { PhotoRenderer } from '@rolecraft/pdf-export';

export const GPS_MARKER = 'RC-GPS-25.0330N-121.5654E';
export const DEVICE_MARKER = 'RC-DEVICE-SyntheticCam';

function segment(marker: number, payload: number[] | string): Buffer {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'latin1') : Buffer.from(payload);
  const head = Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  return Buffer.concat([head, body]);
}

/** 帶 EXIF（GPS、裝置）、XMP、註解的 JPEG；padding 用來做出大檔。 */
export function dirtyJpeg(width: number, height: number, padding = 0): Uint8Array {
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe1, `Exif\0\0II*\0GPSLatitude ${GPS_MARKER} Make ${DEVICE_MARKER}`),
      segment(0xe1, `http://ns.adobe.com/xap/1.0/\0${GPS_MARKER}`),
      segment(0xfe, DEVICE_MARKER),
      segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
      segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
      segment(0xc4, [0x00, 1, ...Array.from({ length: 15 }, () => 0), 0]),
      segment(0xda, [1, 1, 0x00, 0, 63, 0]),
      Buffer.alloc(padding, 0x55),
      Buffer.from([0x12, 0x34, 0xff, 0xd9]),
      Buffer.from(`trailer ${GPS_MARKER}`, 'latin1'),
    ]),
  );
}

/** 假重繪器：照請求縮放，輸出仍帶中繼資料的 JPEG（模擬會漏的編碼器）。 */
export function leakyRenderer(
  source: { width: number; height: number },
  padding = 0,
): PhotoRenderer {
  return (request) => {
    const image = (edge: number) => {
      const scale = Math.min(1, edge / Math.max(source.width, source.height));
      const width = Math.round(source.width * scale);
      const height = Math.round(source.height * scale);
      const pad = edge === request.maxEdge ? padding : 0;
      return {
        width,
        height,
        base64: Buffer.from(dirtyJpeg(width, height, pad)).toString('base64'),
      };
    };
    return Promise.resolve({
      photo: image(request.maxEdge),
      thumbnail: image(request.thumbnailEdge),
    });
  };
}

export const containsText = (bytes: Uint8Array, text: string): boolean =>
  Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));
