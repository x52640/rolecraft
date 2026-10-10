// Native Messaging 訊息框架（ADR-0003）：4 bytes 長度（native byte order）＋ UTF-8 JSON。
// 官方：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-host-protocol
import { Buffer } from 'node:buffer';
import os from 'node:os';

/** host → 瀏覽器單則上限 1 MB（官方限制）。超過要分塊，不能送出。 */
export const MAX_OUTGOING_BYTES = 1024 * 1024;

/**
 * 瀏覽器 → host 單則上限。官方上限 64 MiB；本專案只收擷取內容與小型指令，
 * 自訂 1 MiB，超過即視為協定錯誤並斷線。
 */
export const MAX_INCOMING_BYTES = 1024 * 1024;

const HEADER_BYTES = 4;
const LITTLE_ENDIAN = os.endianness() === 'LE';

export type FrameErrorCode = 'incoming_too_large' | 'outgoing_too_large' | 'bad_json';

export class FrameError extends Error {
  readonly code: FrameErrorCode;

  constructor(code: FrameErrorCode, message: string) {
    super(message);
    this.name = 'FrameError';
    this.code = code;
  }
}

function writeLength(length: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  if (LITTLE_ENDIAN) header.writeUInt32LE(length, 0);
  else header.writeUInt32BE(length, 0);
  return header;
}

function readLength(buffer: Buffer): number {
  return LITTLE_ENDIAN ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
}

/** 把一個 JSON 值編成一個框。超過 1 MB 直接丟錯，不送出半截。 */
export function encodeFrame(value: unknown, maxBytes: number = MAX_OUTGOING_BYTES): Buffer {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new TypeError('框內容必須可序列化成 JSON');
  const body = Buffer.from(json, 'utf8');
  if (body.length > maxBytes) {
    throw new FrameError('outgoing_too_large', `回應 ${body.length} bytes 超過上限 ${maxBytes}`);
  }
  return Buffer.concat([writeLength(body.length), body]);
}

/**
 * 串流解碼器：餵任意切法的 chunk，吐出完整訊息。
 * 長度欄位超過上限或 JSON 壞掉時丟 FrameError；呼叫端應直接結束連線，不嘗試重新同步。
 * 長度欄位在讀到內容前就檢查，所以不會為了惡意長度預先配置記憶體。
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);
  private failed = false;
  private readonly maxBytes: number;

  constructor(maxBytes: number = MAX_INCOMING_BYTES) {
    this.maxBytes = maxBytes;
  }

  push(chunk: Buffer): unknown[] {
    if (this.failed) throw new FrameError('bad_json', '解碼器已因錯誤停止');
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.length >= HEADER_BYTES) {
      const length = readLength(this.buffer);
      if (length > this.maxBytes) {
        this.failed = true;
        throw new FrameError(
          'incoming_too_large',
          `訊息 ${length} bytes 超過上限 ${this.maxBytes}`,
        );
      }
      if (this.buffer.length < HEADER_BYTES + length) break;
      const body = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + length);
      this.buffer = this.buffer.subarray(HEADER_BYTES + length);
      messages.push(this.parse(body));
    }
    return messages;
  }

  /** 串流結束時還有殘留位元組＝框被截斷。 */
  get hasPartial(): boolean {
    return this.buffer.length > 0;
  }

  private parse(body: Buffer): unknown {
    try {
      // fatal：非法 UTF-8 也算壞框，不默默換成替代字元。
      const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
      return JSON.parse(text) as unknown;
    } catch {
      this.failed = true;
      throw new FrameError('bad_json', '訊息不是合法 UTF-8 JSON');
    }
  }
}
