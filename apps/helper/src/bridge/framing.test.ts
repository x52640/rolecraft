import { Buffer } from 'node:buffer';
import os from 'node:os';

import { describe, expect, it } from 'vitest';

import { FrameDecoder, FrameError, MAX_OUTGOING_BYTES, encodeFrame } from './framing.ts';

function header(length: number): Buffer {
  const h = Buffer.alloc(4);
  if (os.endianness() === 'LE') h.writeUInt32LE(length, 0);
  else h.writeUInt32BE(length, 0);
  return h;
}

function rawFrame(body: string | Buffer): Buffer {
  const b = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return Buffer.concat([header(b.length), b]);
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof FrameError ? err.code : 'other';
  }
  return undefined;
}

describe('encodeFrame', () => {
  it('寫入 native byte order 長度＋UTF-8 JSON（含中文）', () => {
    const frame = encodeFrame({ text: '前端工程師' });
    const body = Buffer.from(JSON.stringify({ text: '前端工程師' }), 'utf8');
    expect(frame.subarray(0, 4)).toEqual(header(body.length));
    expect(frame.subarray(4).toString('utf8')).toBe(body.toString('utf8'));
  });

  it('超過 1 MB 拒絕，不送出半截', () => {
    expect(codeOf(() => encodeFrame({ s: 'x'.repeat(MAX_OUTGOING_BYTES) }))).toBe(
      'outgoing_too_large',
    );
    expect(() => encodeFrame({ s: 'x'.repeat(MAX_OUTGOING_BYTES - 20) })).not.toThrow();
  });

  it('不可序列化的值被拒', () => {
    expect(() => encodeFrame(undefined)).toThrow(TypeError);
  });
});

describe('FrameDecoder', () => {
  it('任意切碎與多則黏包都能還原', () => {
    const all = Buffer.concat([rawFrame('{"a":"一"}'), rawFrame('[1,2]'), rawFrame('"三"')]);
    const decoder = new FrameDecoder();
    const out: unknown[] = [];
    for (let i = 0; i < all.length; i += 3) out.push(...decoder.push(all.subarray(i, i + 3)));
    expect(out).toEqual([{ a: '一' }, [1, 2], '三']);
    expect(decoder.hasPartial).toBe(false);
  });

  it('長度欄位超過上限：只讀到標頭就拒絕', () => {
    const decoder = new FrameDecoder(16);
    expect(codeOf(() => decoder.push(header(17)))).toBe('incoming_too_large');
  });

  it('長度欄位溢位（0xFFFFFFFF）被拒，不配置記憶體', () => {
    const decoder = new FrameDecoder();
    expect(codeOf(() => decoder.push(Buffer.from([0xff, 0xff, 0xff, 0xff])))).toBe(
      'incoming_too_large',
    );
  });

  it('壞 JSON、空框、非法 UTF-8 都算 bad_json', () => {
    expect(codeOf(() => new FrameDecoder().push(rawFrame('{"op":')))).toBe('bad_json');
    expect(codeOf(() => new FrameDecoder().push(rawFrame('')))).toBe('bad_json');
    expect(codeOf(() => new FrameDecoder().push(rawFrame(Buffer.from([0x22, 0xff, 0x22]))))).toBe(
      'bad_json',
    );
  });

  it('出錯後不再接受任何輸入（不重新同步）', () => {
    const decoder = new FrameDecoder();
    expect(codeOf(() => decoder.push(rawFrame('nope')))).toBe('bad_json');
    expect(codeOf(() => decoder.push(rawFrame('{}')))).toBe('bad_json');
  });

  it('截斷的框留下殘留位元組', () => {
    const decoder = new FrameDecoder();
    const frame = rawFrame('{"a":1}');
    expect(decoder.push(frame.subarray(0, frame.length - 1))).toEqual([]);
    expect(decoder.hasPartial).toBe(true);
  });
});
