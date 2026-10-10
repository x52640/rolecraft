import {
  BridgeOperation,
  CONTENT_SCRIPT_OPERATIONS,
  type BridgeRequest,
} from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeClient } from '../bridge/client.ts';
import { handleRelay } from './handler.ts';
import { relayMessage } from './messages.ts';
import { authorizeSender, type SenderInfo } from './sender.ts';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const EDITOR: SenderInfo = { id: EXT, url: `chrome-extension://${EXT}/editor/index.html` };
const JOB_PAGE: SenderInfo = { id: EXT, url: 'https://www.104.com.tw/job/abc', frameId: 0 };
const ID = '0f8fa5c4-3b1e-4c56-9d1a-7a2b9c3d4e5f';

const editorOnly = BridgeOperation.options.filter(
  (op) => !(CONTENT_SCRIPT_OPERATIONS as readonly string[]).includes(op),
);

/** sender 規則只看 op；payload 已由 schema 驗過，這裡用最小形狀。 */
const requestFor = (op: BridgeOperation) => ({ op, payload: {} }) as unknown as BridgeRequest;

describe('relay sender 規則（P1-T041）', () => {
  it('content script 可用的只有職缺／訊息擷取', () => {
    expect(editorOnly).toHaveLength(BridgeOperation.options.length - 2);
    expect(editorOnly).toContain('request_draft');
    expect(editorOnly).toContain('claims.confirm');
  });

  it.each(editorOnly)('content script 呼叫 %s：拒絕', (op) => {
    expect(authorizeSender(JOB_PAGE, requestFor(op), EXT)).toEqual({
      allowed: false,
      reason: `content script 不能呼叫 ${op}`,
    });
  });

  it.each(BridgeOperation.options)('擴充功能頁呼叫 %s：允許', (op) => {
    expect(authorizeSender(EDITOR, requestFor(op), EXT)).toEqual({ allowed: true });
  });

  it.each(editorOnly)('其他擴充功能的頁面呼叫 %s：拒絕', (op) => {
    const other = { id: EXT, url: 'chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/x.html' };
    expect(authorizeSender(other, requestFor(op), EXT).allowed).toBe(false);
  });

  it('職缺頁送出合法的事實項確認：拒絕且不轉送；編輯器頁則轉送', async () => {
    const request = {
      op: 'claims.confirm',
      payload: {
        claimId: ID,
        text: '完成登入功能',
        completion: 'user_confirmed_done',
        expectedReviewStatus: 'normal',
      },
    };
    const send = vi.fn<BridgeClient['send']>(() => Promise.resolve({ ok: true }));
    const client = { send, close: vi.fn() } satisfies BridgeClient;
    const denied = await handleRelay(relayMessage(request), JOB_PAGE, EXT, client);
    expect(denied).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(send).not.toHaveBeenCalled();
    expect(await handleRelay(relayMessage(request), EDITOR, EXT, client)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('ID 帶路徑的請求在 service worker 就被拒，不轉送', async () => {
    const send = vi.fn<BridgeClient['send']>();
    const client = { send, close: vi.fn() } satisfies BridgeClient;
    const request = { op: 'jobs.get', payload: { jobSnapshotId: '/etc/passwd' } };
    const res = await handleRelay(relayMessage(request), EDITOR, EXT, client);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(send).not.toHaveBeenCalled();
  });
});
