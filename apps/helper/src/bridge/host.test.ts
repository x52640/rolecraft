import { Buffer } from 'node:buffer';
import os from 'node:os';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED,
  anyString,
  env,
  OTHER,
  reply,
  SECRET,
  recordingLogger,
  requests,
} from '../__fixtures__/requests.ts';
import type { HelperServices } from '../handlers/services.ts';
import { FrameDecoder, MAX_OUTGOING_BYTES, encodeFrame } from './framing.ts';
import { EXIT_CODES, MAX_PENDING_REQUESTS, startHost } from './host.ts';

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
const frame = (id: string, request: unknown = requests.request_draft) =>
  encodeFrame(env(id, request));

const INVALID = { ok: false, error: { code: 'invalid_request', message: anyString } };
const INTERNAL = { ok: false, error: { code: 'internal_error', message: anyString } };
const DRAFT_OK = { ok: true, workJobId: 'w-1' };
const draftAfter = (ms: number): HelperServices => ({
  draft: { request: () => delay(ms).then(() => ({ workJobId: 'w-1' })) },
});

describe('startHost：來源', () => {
  it.each([
    [OTHER, true],
    ['https://www.104.com.tw/', false],
    [null, false],
  ])('拒絕 allowed_origins 以外的 origin %s，不讀任何輸入', async (origin, formatValid) => {
    const h = host({}, origin);
    h.input.write(frame('r1'));
    expect(await h.exitCode).toBe(EXIT_CODES.origin);
    expect(h.replies).toEqual([]);
    expect(h.logger.entries).toContainEqual({
      event: 'origin_rejected',
      originFormatValid: formatValid,
    });
  });
});

describe('startHost：往返', () => {
  it('正常請求以同一 id 回覆，stdin 結束即以 0 結束', async () => {
    const h = host(draftAfter(0));
    h.input.end(frame('r1'));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([reply('r1', DRAFT_OK)]);
  });

  it('未接服務：以該 id 回 not_implemented', async () => {
    const h = host();
    h.input.end(frame('r1'));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([
      reply('r1', { ok: false, error: { code: 'not_implemented', message: anyString } }),
    ]);
  });

  it('同時多則請求：並行處理，完成先回；每則依 id 對到自己的回覆', async () => {
    let active = 0;
    let maxActive = 0;
    const track = async <T>(ms: number, value: T): Promise<T> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(ms);
      active -= 1;
      return value;
    };
    const h = host({
      jobCapture: { submit: () => track(30, { jobSnapshotId: 'j-1' }) },
      messageCapture: { submit: () => track(1, { messageDraftId: 'm-1' }) },
      draft: { request: () => track(10, { workJobId: 'w-1' }) },
    });
    h.input.end(
      Buffer.concat([
        frame('job', requests.submit_job_capture),
        frame('bad-op', { op: 'nope', payload: {} }),
        frame('msg', requests.submit_message_capture),
        frame('draft', requests.request_draft),
      ]),
    );
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(maxActive).toBe(3);
    expect(h.replies).toEqual([
      reply('bad-op', INVALID),
      reply('msg', { ok: true, messageDraftId: 'm-1' }),
      reply('draft', DRAFT_OK),
      reply('job', { ok: true, jobSnapshotId: 'j-1' }),
    ]);
  });

  it('handler 拋例外不影響其他請求，日誌不含履歷內容', async () => {
    const h = host({
      messageCapture: { submit: () => Promise.reject(new Error(SECRET)) },
      ...draftAfter(0),
    });
    h.input.end(
      Buffer.concat([
        frame('a', requests.submit_message_capture),
        frame('b', requests.request_draft),
      ]),
    );
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual(expect.arrayContaining([reply('a', INTERNAL), reply('b', DRAFT_OK)]));
    expect(h.replies).toHaveLength(2);
    expect(h.logger.text()).not.toContain('王小明');
  });

  it('回應超過 1 MB：以同一 id 改回 internal_error，不送出超大框', async () => {
    const h = host({
      jobCapture: {
        submit: () => Promise.resolve({ jobSnapshotId: 'x'.repeat(MAX_OUTGOING_BYTES) }),
      },
    });
    h.input.end(frame('big', requests.submit_job_capture));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([reply('big', INTERNAL)]);
    expect(h.logger.entries.some((e) => e.event === 'response_too_large')).toBe(true);
  });

  it('日誌不記請求 id', async () => {
    const h = host(draftAfter(0));
    h.input.end(frame('secret-id-123'));
    await h.exitCode;
    expect(h.logger.text()).not.toContain('secret-id-123');
  });
});

describe('startHost：請求 id', () => {
  it.each<[string, unknown]>([
    ['缺 id', { request: requests.request_draft }],
    ['id 是數字', { id: 1, request: requests.request_draft }],
    ['id 是 null', { id: null, request: requests.request_draft }],
    ['id 是物件', { id: { x: 1 }, request: requests.request_draft }],
    ['id 是陣列', { id: ['a'], request: requests.request_draft }],
    ['id 是空字串', { id: '', request: requests.request_draft }],
    ['id 超長（65 字）', { id: 'x'.repeat(65), request: requests.request_draft }],
    ['id 含路徑字元', { id: '../etc/passwd', request: requests.request_draft }],
    ['舊格式（沒有信封）', requests.request_draft],
    ['不是物件', 'r1'],
    ['陣列', [env('r1', requests.request_draft)]],
  ])('%s：無法歸屬，等在途請求回完，送 id 為 null 的失敗並以 3 結束', async (_name, bad) => {
    let calls = 0;
    const h = host({
      draft: {
        request: async () => {
          calls += 1;
          await delay(10);
          return { workJobId: 'w-1' };
        },
      },
    });
    h.input.write(Buffer.concat([frame('ok-1'), encodeFrame(bad), frame('after')]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('ok-1', DRAFT_OK), reply(null, INVALID)]);
    expect(calls).toBe(1);
    expect(h.logger.entries).toContainEqual({ event: 'protocol_error', code: 'invalid_id' });
  });

  it('JSON 的 "__proto__" 鍵帶 id：不從原型鏈取 id', async () => {
    const h = host(draftAfter(0));
    const body = Buffer.from(
      JSON.stringify({ request: requests.request_draft }).replace('{', '{"__proto__":{"id":"p"},'),
    );
    h.input.write(Buffer.concat([header(body.length), body]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply(null, INVALID)]);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    '原型鏈名稱 %s 當 id 只是普通字串',
    async (id) => {
      const h = host(draftAfter(0));
      h.input.end(Buffer.concat([frame(id), frame(`${id}-2`)]));
      expect(await h.exitCode).toBe(EXIT_CODES.ok);
      expect(h.replies).toEqual(
        expect.arrayContaining([reply(id, DRAFT_OK), reply(`${id}-2`, DRAFT_OK)]),
      );
    },
  );

  it('id 恰好 64 字：接受', async () => {
    const id = 'x'.repeat(64);
    const h = host(draftAfter(0));
    h.input.end(frame(id));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([reply(id, DRAFT_OK)]);
  });

  it('重複 id（仍在處理中）：原請求只回一次，不以該 id 再回，送 null 失敗後以 3 結束', async () => {
    let calls = 0;
    const h = host({
      draft: {
        request: async () => {
          calls += 1;
          await delay(20);
          return { workJobId: 'w-1' };
        },
      },
    });
    h.input.write(Buffer.concat([frame('dup'), frame('dup'), frame('later')]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('dup', DRAFT_OK), reply(null, INVALID)]);
    expect(calls).toBe(1);
    expect(h.logger.entries).toContainEqual({ event: 'protocol_error', code: 'duplicate_id' });
  });

  it('重複 id（已回覆過）：同樣斷線，不再回第二次', async () => {
    const h = host(draftAfter(0));
    h.input.write(frame('once'));
    await delay(10);
    h.input.write(frame('once'));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('once', DRAFT_OK), reply(null, INVALID)]);
  });

  it('信封多帶欄位或缺 request：以該 id 回 invalid_request，連線繼續', async () => {
    const h = host(draftAfter(0));
    h.input.end(
      Buffer.concat([
        encodeFrame({ ...env('x1', requests.request_draft), cwd: '/tmp' }),
        encodeFrame({ id: 'x2' }),
        frame('x3'),
      ]),
    );
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([reply('x1', INVALID), reply('x2', INVALID), reply('x3', DRAFT_OK)]);
    expect(h.logger.text()).not.toContain('/tmp');
  });

  it('信封被拒後重用同一 id：仍算重複', async () => {
    const h = host(draftAfter(0));
    h.input.write(Buffer.concat([encodeFrame({ id: 'x1' }), frame('x1')]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('x1', INVALID), reply(null, INVALID)]);
  });
});

describe('startHost：框錯誤一律斷線', () => {
  it('超大框：先回完在途請求，再送 null 失敗並以 3 結束', async () => {
    const h = host(draftAfter(10), ALLOWED, { maxIncomingBytes: 1024 });
    h.input.write(frame('r1'));
    h.input.write(header(2048));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('r1', DRAFT_OK), reply(null, INVALID)]);
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
    const h = host(draftAfter(0));
    const bad = Buffer.from(`{"id":"r0","request":${SECRET}`, 'utf8');
    h.input.write(Buffer.concat([header(bad.length), bad, frame('r1')]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply(null, INVALID)]);
    expect(h.logger.text()).not.toContain('王小明');
  });

  // P1-T014 對抗驗證回歸：壞框前已解出的請求不能遺失，結果與 pipe 怎麼切 chunk 無關。
  describe.each([
    ['壞 JSON', Buffer.concat([header(3), Buffer.from('{{{')])],
    ['超長標頭', header(2048)],
  ])('合法框＋%s', (_name, bad) => {
    const run = async (chunks: Buffer[]) => {
      let handled = 0;
      const services: HelperServices = {
        draft: {
          request: () => {
            handled += 1;
            return Promise.resolve({ workJobId: 'w-1' });
          },
        },
      };
      const h = host(services, ALLOWED, { maxIncomingBytes: 1024 });
      for (const chunk of chunks) {
        h.input.write(chunk);
        await delay(5);
      }
      expect(await h.exitCode).toBe(EXIT_CODES.protocol);
      return { handled, replies: h.replies };
    };
    const expected = { handled: 1, replies: [reply('good', DRAFT_OK), reply(null, INVALID)] };
    const good = frame('good');

    it('同一 chunk：先回合法請求，再送 null 失敗', async () => {
      expect(await run([Buffer.concat([good, bad])])).toEqual(expected);
    });

    it('分兩個 chunk（對照）：結果一致', async () => {
      expect(await run([good, bad])).toEqual(expected);
    });
  });

  it('截斷的框：stdin 結束時以 4 結束，不處理半截內容', async () => {
    const f = frame('r1');
    const h = host(draftAfter(0));
    h.input.end(f.subarray(0, f.length - 2));
    expect(await h.exitCode).toBe(EXIT_CODES.truncated);
    expect(h.replies).toEqual([]);
  });

  it('未回覆請求過多：先回完在途的，再送 null 失敗並斷線', async () => {
    const h = host(draftAfter(20), ALLOWED, { maxPending: 2 });
    h.input.write(Buffer.concat([frame('a'), frame('b'), frame('c')]));
    expect(await h.exitCode).toBe(EXIT_CODES.protocol);
    expect(h.replies).toEqual([reply('a', DRAFT_OK), reply('b', DRAFT_OK), reply(null, INVALID)]);
  });

  it('在途上限與 contracts 一致；回覆後名額釋放', async () => {
    expect(MAX_PENDING_REQUESTS).toBe(32);
    const h = host(draftAfter(0), ALLOWED, { maxPending: 1 });
    h.input.write(frame('a'));
    await delay(10);
    h.input.end(frame('b'));
    expect(await h.exitCode).toBe(EXIT_CODES.ok);
    expect(h.replies).toEqual([reply('a', DRAFT_OK), reply('b', DRAFT_OK)]);
  });
});
