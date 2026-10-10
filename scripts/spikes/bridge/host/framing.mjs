/* global Buffer */
// Native Messaging 訊息框架：4 bytes 長度（native byte order；macOS arm64/x64 皆為 little-endian）＋ UTF-8 JSON。
// 官方：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-host-protocol
import os from 'node:os';

/** host → 瀏覽器單則上限 1 MB（官方限制）。 */
export const MAX_OUTGOING_BYTES = 1024 * 1024;
/** 瀏覽器 → host：官方上限 64 MiB；原型自訂更小的上限，超過就斷線。 */
export const MAX_INCOMING_BYTES = 64 * 1024;

const LITTLE_ENDIAN = os.endianness() === 'LE';

export class FrameError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** 把一個 JSON 值編成一個框。超過 1 MB 直接丟錯，不送出半截。 */
export function encodeFrame(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > MAX_OUTGOING_BYTES) {
    throw new FrameError('outgoing_too_large', `訊息 ${body.length} bytes 超過 1 MB 上限`);
  }
  const header = Buffer.alloc(4);
  if (LITTLE_ENDIAN) header.writeUInt32LE(body.length, 0);
  else header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/**
 * 串流解碼器：餵任意切法的 chunk，吐出完整訊息。
 * 長度超過上限或 JSON 壞掉時丟 FrameError（呼叫端應直接結束連線，不嘗試重新同步）。
 */
export class FrameDecoder {
  /** @param {number} [maxBytes] */
  constructor(maxBytes = MAX_INCOMING_BYTES) {
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
  }

  /** @param {Buffer} chunk @returns {unknown[]} */
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = LITTLE_ENDIAN ? this.buffer.readUInt32LE(0) : this.buffer.readUInt32BE(0);
      if (length > this.maxBytes) {
        throw new FrameError(
          'incoming_too_large',
          `訊息 ${length} bytes 超過上限 ${this.maxBytes}`,
        );
      }
      if (this.buffer.length < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      try {
        messages.push(JSON.parse(body));
      } catch {
        throw new FrameError('bad_json', '訊息不是合法 JSON');
      }
    }
    return messages;
  }

  /** 串流結束時還有殘留位元組＝框被截斷。 */
  get hasPartial() {
    return this.buffer.length > 0;
  }
}
