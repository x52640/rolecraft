import { Buffer } from 'node:buffer';
import os from 'node:os';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED,
  anyString,
  OTHER,
  SECRET,
  recordingLogger,
  requests,
} from '../__fixtures__/requests.ts';
import type { HelperServices } from '../handlers/services.ts';
import { FrameDecoder, MAX_OUTGOING_BYTES, encodeFrame } from './framing.ts';
import { EXIT_CODES, startHost } from './host.ts';

function header(length: number): Buffer {
  const h = Buffer.alloc(4);
  if (os.endianness() === 'LE') h.writeUInt32LE(length, 0);
  else h.writeUInt32BE(length, 0);
  return h;
}

interface Harness {
  input: PassThrough;
  replies: unknown[];
  exitCode: Promise<number>;
  logger: ReturnType<typeof recordingLogger>;
}

function host(
  services: HelperServices = {},
  origin: string | null = ALLOWED,
  extra: { maxPending?: number; maxIncomingBytes?: number } = {},
): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies: unknown[] = [];
  const decoder = new FrameDecoder(MAX_OUTGOING_BYTES);
  output.on('data', (chunk: Buffer) => replies.push(...decoder.push(chunk)));
  const logger = recordingLogger();
  const exitCode = new Promise<number>((resolve) => {
    startHost({
      input,
      output,
      origin: origin ?? undefined,
      allowedOrigins: [ALLOWED],
      services,
      logger,
      exit: resolve,
      ...extra,
    });
  });
  return { input, replies, exitCode, logger };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('startHost：來源', () => {
  it.each([
    [OTHER, true],
    ['https://www.104.com.tw/', false],
    [null, false],
  ])('拒絕 allowed_origins 以外的 origin %s，不讀任何輸入', async (origin, formatValid) => {
    const h = host({}, origin);
    h.input.write(encodeFrame(requests.open_editor));
    expect(await h.exitCode).toBe(EXIT_CODES.origin);
    expect(h.replies).toEqual([]);
    expect(h.logger.entries).toContainEqual({
      event: 'origin_rejected',
      originFormatValid: formatValid,
    });
  });
});

describe('startHost：往返', () => {
  it('正常請求回覆後，stdin 結束即以 0 結束', async () => {
    const h = host({ editor: { open: () => Promise.resolve() } });
    h.input.end(encodeFrame(requests.open_editor));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([{ ok: true }]);
  });

  it('同時多則請求：依抵達順序逐一處理、依序回覆', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const track = async <T>(name: string, ms: number, value: T): Promise<T> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(ms);
      order.push(name);
      active -= 1;
      return value;
    };
    const h = host({
      jobCapture: { submit: () => track('job', 30, { jobSnapshotId: 'j-1' }) },
      messageCapture: { submit: () => track('msg', 1, { messageDraftId: 'm-1' }) },
      draft: { request: () => track('draft', 10, { workJobId: 'w-1' }) },
    });
    h.input.end(
      Buffer.concat([
        encodeFrame(requests.submit_job_capture),
        encodeFrame({ op: 'nope', payload: {} }),
        encodeFrame(requests.submit_message_capture),
        encodeFrame(requests.request_draft),
      ]),
    );
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(order).toEqual(['job', 'msg', 'draft']);
    expect(maxActive).toBe(1);
    expect(h.replies).toEqual([
      { ok: true, jobSnapshotId: 'j-1' },
      { ok: false, error: { code: 'invalid_request', message: anyString } },
      { ok: true, messageDraftId: 'm-1' },
      { ok: true, workJobId: 'w-1' },
    ]);
  });

  it('handler 拋例外不影響後續請求，日誌不含履歷內容', async () => {
    const h = host({
      messageCapture: { submit: () => Promise.reject(new Error(SECRET)) },
      editor: { open: () => Promise.resolve() },
    });
    h.input.end(
      Buffer.concat([
        encodeFrame(requests.submit_message_capture),
        encodeFrame(requests.open_editor),
      ]),
    );
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([
      { ok: false, error: { code: 'internal_error', message: anyString } },
      { ok: true },
    ]);
    expect(h.logger.text()).not.toContain('王小明');
  });

  it('回應超過 1 MB：改回 internal_error，不送出超大框', async () => {
    const h = host({
      jobCapture: {
        submit: () => Promise.resolve({ jobSnapshotId: 'x'.repeat(MAX_OUTGOING_BYTES) }),
      },
    });
    h.input.end(encodeFrame(requests.submit_job_capture));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([
      { ok: false, error: { code: 'internal_error', message: anyString } },
    ]);
    expect(h.logger.entries.some((e) => e.event === 'response_too_large')).toBe(true);
  });
});

describe('startHost：框錯誤一律斷線', () => {
  it('超大框：先回完排隊中的請求，再送一則失敗並以 3 結束', async () => {
    const h = host({ editor: { open: () => delay(10) } }, ALLOWED, { maxIncomingBytes: 1024 });
    h.input.write(encodeFrame(requests.open_editor));
    h.input.write(header(2048));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([
      { ok: true },
      { ok: false, error: { code: 'invalid_request', message: anyString } },
    ]);
    expect(h.logger.entries).toContainEqual({
      event: 'protocol_error',
      code: 'incoming_too_large',
    });
  });

  it('長度欄位溢位（0xFFFFFFFF）以 3 結束', async () => {
    const h = host();
    h.input.write(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
  });

  it('壞 JSON 以 3 結束，之後的框不處理', async () => {
    const editor = { open: () => Promise.resolve() };
    const h = host({ editor });
    const bad = Buffer.from(`{"op":"open_editor",${SECRET}`, 'utf8');
    h.input.write(Buffer.concat([header(bad.length), bad, encodeFrame(requests.open_editor)]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toHaveLength(1);
    expect(h.replies[0]).toMatchObject({ ok: false });
    expect(h.logger.text()).not.toContain('王小明');
  });

  it('截斷的框：stdin 結束時以 4 結束，不處理半截內容', async () => {
    const frame = encodeFrame(requests.open_editor);
    const h = host({ editor: { open: () => Promise.resolve() } });
    h.input.end(frame.subarray(0, frame.length - 2));
    expect(await h.exitCode).toBe(EXIT_CODES.truncated);
    expect(h.replies).toEqual([]);
  });

  it('未回覆請求過多：斷線', async () => {
    const h = host({ editor: { open: () => delay(20) } }, ALLOWED, { maxPending: 2 });
    const frame = encodeFrame(requests.open_editor);
    h.input.write(Buffer.concat([frame, frame, frame]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([
      { ok: true },
      { ok: true },
      { ok: false, error: { code: 'invalid_request', message: anyString } },
    ]);
  });
});
