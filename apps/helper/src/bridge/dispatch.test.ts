import { BRIDGE_SCHEMAS, BridgeOperation } from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  SECRET,
  anyString,
  recordingLogger,
  requests as captureRequests,
} from '../__fixtures__/requests.ts';
import type { HelperServices } from '../handlers/services.ts';
import { editorRequests } from './__fixtures__/editor-requests.ts';
import { dispatch } from './dispatch.ts';

/** 每個操作一則合法請求。 */
const requests = { ...captureRequests, ...editorRequests };
const CAPTURE_OPS = Object.keys(captureRequests) as (keyof typeof captureRequests)[];

const okServices = () => ({
  jobs: { submitCapture: vi.fn(() => Promise.resolve({ jobSnapshotId: 'j-1' })) },
  messages: {
    submitCapture: vi.fn(() => Promise.resolve({ messageDraftId: 'm-1' })),
    requestDraft: vi.fn(() => Promise.resolve({ workJobId: 'w-1' })),
  },
});

async function run(message: unknown, services: HelperServices = okServices()) {
  const logger = recordingLogger();
  const result = await dispatch(message, services, logger);
  return { ...result, logger };
}

const anyNumber: unknown = expect.any(Number);
const INVALID = { ok: false, error: { code: 'invalid_request', message: anyString } };
const INTERNAL = { ok: false, error: { code: 'internal_error', message: anyString } };

describe('dispatch：操作清單', () => {
  it('fixture 涵蓋 contracts 的每個操作', () => {
    expect(Object.keys(requests).sort()).toEqual([...BridgeOperation.options].sort());
  });

  it('已接服務的擷取操作：合法請求回合規成功回應', async () => {
    for (const op of CAPTURE_OPS) {
      const { response } = await run(requests[op]);
      expect(response).toMatchObject({ ok: true });
      expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    }
  });

  it.each([
    'send_message',
    'submit_application',
    'run_command',
    'read_file',
    'pickFolders',
    'toString',
    '__proto__',
    'constructor',
    '',
    'SUBMIT_JOB_CAPTURE',
  ])('未知操作 %s 被拒', async (op) => {
    const { response, op: resolved } = await run({ op, payload: {} });
    expect(response).toEqual(INVALID);
    expect(resolved).toBeNull();
  });

  it('JSON.parse 產生的 __proto__ 鍵與缺 op 都被拒', async () => {
    expect(
      (await run(JSON.parse('{"__proto__":{"op":"request_draft"},"payload":{}}'))).response,
    ).toEqual(INVALID);
    expect((await run({ payload: {} })).response).toEqual(INVALID);
    expect((await run({ op: ['request_draft'], payload: {} })).response).toEqual(INVALID);
  });

  it.each([null, 1, 'request_draft', [], [requests.request_draft], true])(
    '非物件訊息 %j 被拒',
    async (message) => {
      expect((await run(message)).response).toEqual(INVALID);
    },
  );
});

describe('dispatch：schema', () => {
  it.each(BridgeOperation.options)('%s 頂層多帶欄位被拒', async (op) => {
    const services = okServices();
    const { response } = await run({ ...requests[op], cwd: '/tmp' }, services);
    expect(response).toEqual(INVALID);
    expect(services.jobs.submitCapture).not.toHaveBeenCalled();
    expect(services.messages.submitCapture).not.toHaveBeenCalled();
    expect(services.messages.requestDraft).not.toHaveBeenCalled();
  });

  it.each(BridgeOperation.options)('%s payload 多帶欄位被拒', async (op) => {
    const bad = { ...requests[op], payload: { ...requests[op].payload, path: '/etc/passwd' } };
    expect((await run(bad)).response).toEqual(INVALID);
  });

  it('巢狀多帶欄位、缺 payload、型別不符都被拒', async () => {
    const job = requests.submit_job_capture;
    const fields = { ...job.payload.fields, location: { status: 'not_provided', args: ['-c'] } };
    expect((await run({ ...job, payload: { ...job.payload, fields } })).response).toEqual(INVALID);
    expect((await run({ op: 'request_draft' })).response).toEqual(INVALID);
    const draft = { op: 'request_draft', payload: { messageDraftId: 7, replyIntent: 'x' } };
    expect((await run(draft)).response).toEqual(INVALID);
  });

  it('拒絕時不回填請求內容', async () => {
    const bad = { ...requests.submit_message_capture, extra: SECRET };
    const { response, logger } = await run(bad);
    expect(JSON.stringify(response)).not.toContain('王小明');
    expect(logger.text()).not.toContain('王小明');
  });
});

describe('dispatch：內容只當資料', () => {
  it('含路徑／指令字樣的 payload 原樣交給服務，不被解讀', async () => {
    const services = okServices();
    await run(requests.submit_job_capture, services);
    await run(requests.submit_message_capture, services);
    await run(requests.request_draft, services);
    expect(services.jobs.submitCapture).toHaveBeenCalledWith(requests.submit_job_capture.payload);
    expect(services.messages.submitCapture).toHaveBeenCalledWith(
      requests.submit_message_capture.payload,
    );
    expect(services.messages.requestDraft).toHaveBeenCalledWith(requests.request_draft.payload);
  });
});

describe('dispatch：handler 失敗', () => {
  it.each(BridgeOperation.options)('%s 未接服務時回 not_implemented，不偽造成功', async (op) => {
    const { response, logger } = await run(requests[op], {});
    expect(logger.entries).toContainEqual({
      event: 'request_handled',
      op,
      ok: false,
      ms: anyNumber,
    });
    expect(response).toEqual({
      ok: false,
      error: { code: 'not_implemented', message: anyString },
    });
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
  });

  it('handler 拋例外：回 internal_error，回應與日誌都不含例外內容', async () => {
    const services: HelperServices = {
      messages: {
        requestDraft: () => Promise.resolve({ workJobId: 'w-1' }),
        submitCapture: () => {
          const err = new Error(`寫入失敗：${SECRET}`);
          err.name = SECRET;
          return Promise.reject(err);
        },
      },
    };
    const { response, logger } = await run(requests.submit_message_capture, services);
    expect(response).toEqual(INTERNAL);
    expect(JSON.stringify(response)).not.toContain('王小明');
    expect(logger.text()).not.toContain('王小明');
    expect(logger.text()).not.toContain('rm -rf');
    expect(logger.entries).toContainEqual({
      event: 'handler_failed',
      op: 'submit_message_capture',
      errorName: 'Error',
    });
  });

  it('handler 同步拋出非 Error 值也被攔下', async () => {
    const services: HelperServices = {
      messages: {
        submitCapture: () => Promise.resolve({ messageDraftId: 'm-1' }),
        requestDraft: () => {
          throw SECRET as unknown as Error;
        },
      },
    };
    const { response, logger } = await run(requests.request_draft, services);
    expect(response).toEqual(INTERNAL);
    expect(logger.text()).not.toContain('王小明');
  });

  it('服務回傳不合 schema 的值：回 internal_error，不轉送', async () => {
    const services: HelperServices = {
      jobs: { submitCapture: () => Promise.resolve({ jobSnapshotId: '' }) },
    };
    const { response, logger } = await run(requests.submit_job_capture, services);
    expect(response).toEqual(INTERNAL);
    expect(logger.entries).toContainEqual({ event: 'response_invalid', op: 'submit_job_capture' });
  });
});
