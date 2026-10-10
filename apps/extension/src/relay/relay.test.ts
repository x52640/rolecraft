import { RELAY_CHANNEL } from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeClient } from '../bridge/client.ts';
import { handleRelay } from './handler.ts';
import { isRelayMessage, relayMessage } from './messages.ts';
import type { SenderInfo } from './sender.ts';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const EDITOR: SenderInfo = { id: EXT, url: `chrome-extension://${EXT}/editor/index.html` };
const JOB_PAGE: SenderInfo = { id: EXT, url: 'https://www.104.com.tw/job/abc', frameId: 0 };

const JOB = {
  op: 'submit_job_capture',
  payload: {
    platform: '104',
    url: 'https://www.104.com.tw/job/abc',
    captureMethod: 'auto',
    capturedAt: '2026-10-10T08:00:00+08:00',
    fields: {
      company: '某公司',
      title: '前端工程師',
      description: '負責網站開發',
      responsibilities: { status: 'not_captured' },
      requirements: { status: 'not_provided' },
      preferredQualifications: { status: 'not_captured' },
      location: { status: 'captured', value: '台北' },
    },
  },
};
const DRAFT = { op: 'request_draft', payload: { messageDraftId: 'm', replyIntent: 'x' } };

function fakeClient() {
  const send = vi.fn<BridgeClient['send']>(() => Promise.resolve({ ok: true, workJobId: 'w-1' }));
  return { client: { send, close: vi.fn() } satisfies BridgeClient, send };
}

async function relay(request: unknown, sender: SenderInfo) {
  const { client, send } = fakeClient();
  const res = await handleRelay(relayMessage(request), sender, EXT, client);
  return { res, forwarded: send.mock.calls.length > 0 };
}

describe('relay message shape', () => {
  it('只認 { channel, request }', () => {
    expect(isRelayMessage(relayMessage(DRAFT))).toBe(true);
    expect(isRelayMessage({ channel: 'rolecraft.bridge', request: DRAFT, path: '/x' })).toBe(false);
    expect(isRelayMessage({ channel: 'other', request: DRAFT })).toBe(false);
    expect(isRelayMessage(null)).toBe(false);
    expect(isRelayMessage([1, 2])).toBe(false);
  });
});

describe('handleRelay 驗發送者', () => {
  it('編輯器頁可用全部操作', async () => {
    expect(await relay(DRAFT, EDITOR)).toMatchObject({ forwarded: true, res: { ok: true } });
    expect((await relay(JOB, EDITOR)).forwarded).toBe(true);
  });

  it('104 職缺頁的 content script 可送 104 自動擷取', async () => {
    expect((await relay(JOB, JOB_PAGE)).forwarded).toBe(true);
  });

  it.each<[string, unknown, SenderInfo]>([
    ['其他擴充功能', DRAFT, { ...EDITOR, id: 'zzzz' }],
    ['其他擴充功能的頁面網址', DRAFT, { id: EXT, url: 'chrome-extension://zzzz/x.html' }],
    ['缺網址', DRAFT, { id: EXT }],
    ['content script 要求草稿', DRAFT, JOB_PAGE],
    ['子框架', JOB, { ...JOB_PAGE, frameId: 3 }],
    ['未註冊網站', JOB, { ...JOB_PAGE, url: 'https://evil.example.com/job/abc' }],
    ['平台不符', { ...JOB, payload: { ...JOB.payload, platform: 'cake' } }, JOB_PAGE],
    [
      'content script 冒充手動貼上',
      { ...JOB, payload: { ...JOB.payload, captureMethod: 'manual_paste' } },
      JOB_PAGE,
    ],
  ])('%s：拒絕且不轉送', async (_name, request, sender) => {
    const { res, forwarded } = await relay(request, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(forwarded).toBe(false);
  });

  it('通道名稱來自 contracts', () => {
    expect(relayMessage(DRAFT).channel).toBe(RELAY_CHANNEL);
    expect(RELAY_CHANNEL).toBe('rolecraft.bridge');
  });

  it.each<[string, unknown]>([
    ['未知操作', { op: 'exec', payload: { cmd: 'ls' } }],
    ['open_editor 已移除', { op: 'open_editor', payload: {} }],
    ['頁面自帶信封 id', { id: 'r1', request: DRAFT }],
  ])('%s：拒絕且不轉送', async (_name, request) => {
    const { res, forwarded } = await relay(request, EDITOR);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(forwarded).toBe(false);
  });

  it('schema 不合法：拒絕且不轉送', async () => {
    const { res, forwarded } = await relay({ op: 'exec', payload: { cmd: 'ls' } }, EDITOR);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(forwarded).toBe(false);
  });
});
