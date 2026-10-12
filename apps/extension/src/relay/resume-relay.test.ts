import { describe, expect, it, vi } from 'vitest';

import type { BridgeClient, BridgeResponse } from '../bridge/client.ts';
import type { SiteEntry } from '../sites/registry.ts';
import { handleRelay } from './handler.ts';
import { relayMessage } from './messages.ts';
import type { SenderInfo } from './sender.ts';

/** 操作×頁型的發送者驗證（web-resume-capture「發送者驗證」）；registry 是合成的（P1-T077 才加實際規則）。 */
const REGISTRY: readonly SiteEntry[] = [
  {
    platform: '104',
    hosts: ['www.104.com.tw'],
    jobPathPrefixes: ['/job/'],
    resumePage: {
      hosts: ['pda.104.com.tw'],
      paths: ['/profile/edit'],
      rootSelector: '#root',
      nameSelector: null,
    },
  },
];

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const EDITOR: SenderInfo = { id: EXT, url: `chrome-extension://${EXT}/editor/index.html` };
const RESUME_PAGE: SenderInfo = {
  id: EXT,
  url: 'https://pda.104.com.tw/profile/edit?vno=abc#top',
  frameId: 0,
};
const JOB_PAGE: SenderInfo = { id: EXT, url: 'https://www.104.com.tw/job/abc', frameId: 0 };

const RESUME = {
  op: 'submit_resume_capture',
  payload: {
    platform: '104',
    url: 'https://pda.104.com.tw/profile/edit',
    capturedAt: '2026-10-12T08:00:00+08:00',
    truncated: false,
    nameText: '王小明',
    blocks: [{ kind: 'heading', level: 2, label: null, text: '工作經歷', continues: false }],
  },
};
const withPayload = (patch: object) => ({ ...RESUME, payload: { ...RESUME.payload, ...patch } });

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
const MESSAGE = {
  op: 'submit_message_capture',
  payload: {
    platform: '104',
    captureMethod: 'auto',
    selectedMessageText: '您好，想邀請您面試',
    jobSnapshotId: null,
  },
};

async function relay(request: unknown, sender: SenderInfo, reply: BridgeResponse = { ok: true }) {
  const send = vi.fn<BridgeClient['send']>(() => Promise.resolve(reply));
  const onResumeCaptured = vi.fn(() => Promise.resolve());
  const client = { send, close: vi.fn() } satisfies BridgeClient;
  const res = await handleRelay(relayMessage(request), sender, EXT, client, {
    registry: REGISTRY,
    onResumeCaptured,
  });
  return { res, forwarded: send.mock.calls.length > 0, opened: onResumeCaptured.mock.calls.length };
}

describe('履歷擷取：操作×頁型', () => {
  it('履歷頁主框架送履歷擷取（含截斷）：轉送，成功後開一個編輯器分頁', async () => {
    expect(await relay(RESUME, RESUME_PAGE)).toEqual({
      res: { ok: true },
      forwarded: true,
      opened: 1,
    });
    expect((await relay(withPayload({ truncated: true }), RESUME_PAGE)).opened).toBe(1);
  });

  it('helper 回失敗：照回給 content script，不開編輯器', async () => {
    const failure: BridgeResponse = {
      ok: false,
      error: { code: 'helper_unavailable', message: '連不上' },
    };
    expect(await relay(RESUME, RESUME_PAGE, failure)).toEqual({
      res: failure,
      forwarded: true,
      opened: 0,
    });
  });

  it('編輯器頁送履歷擷取：拒絕、不轉送、不開編輯器（只限 content script）', async () => {
    const { res, forwarded, opened } = await relay(RESUME, EDITOR);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(forwarded).toBe(false);
    expect(opened).toBe(0);
  });

  it('職缺／訊息擷取在職缺頁照舊通過、不開編輯器', async () => {
    expect(await relay(JOB, JOB_PAGE)).toMatchObject({ forwarded: true, opened: 0 });
    expect(await relay(MESSAGE, JOB_PAGE)).toMatchObject({ forwarded: true, opened: 0 });
  });

  it.each<[string, unknown, SenderInfo]>([
    ['履歷擷取從職缺頁送', withPayload({ url: 'https://www.104.com.tw/job/abc' }), JOB_PAGE],
    [
      '職缺擷取從履歷頁送',
      { ...JOB, payload: { ...JOB.payload, url: RESUME.payload.url } },
      RESUME_PAGE,
    ],
    ['訊息擷取從履歷頁送', MESSAGE, RESUME_PAGE],
    [
      'url 與發送頁路徑不符',
      withPayload({ url: 'https://pda.104.com.tw/profile/edi' }),
      RESUME_PAGE,
    ],
    [
      'url 主機與發送頁不符',
      withPayload({ url: 'https://www.104.com.tw/profile/edit' }),
      RESUME_PAGE,
    ],
    [
      'url 多了查詢字串',
      withPayload({ url: 'https://pda.104.com.tw/profile/edit?vno=abc' }),
      RESUME_PAGE,
    ],
    ['url 多了 #', withPayload({ url: 'https://pda.104.com.tw/profile/edit#top' }), RESUME_PAGE],
    ['子框架', RESUME, { ...RESUME_PAGE, frameId: 2 }],
    ['缺 frameId', RESUME, { id: EXT, url: RESUME_PAGE.url }],
    ['平台不符', withPayload({ platform: 'cake' }), RESUME_PAGE],
    ['未註冊網站', RESUME, { ...RESUME_PAGE, url: 'https://evil.example.com/profile/edit' }],
    ['履歷頁路徑多了斜線', RESUME, { ...RESUME_PAGE, url: 'https://pda.104.com.tw/profile/edit/' }],
    ['其他擴充功能', RESUME, { ...RESUME_PAGE, id: 'zzzz' }],
  ])('%s：拒絕、不轉送、不開編輯器', async (_name, request, sender) => {
    const { res, forwarded, opened } = await relay(request, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(forwarded).toBe(false);
    expect(opened).toBe(0);
  });

  it('正式 registry 還沒有履歷頁規則：任何頁面的履歷擷取都被拒', async () => {
    const send = vi.fn<BridgeClient['send']>(() => Promise.resolve({ ok: true }));
    const client = { send, close: vi.fn() } satisfies BridgeClient;
    const res = await handleRelay(relayMessage(RESUME), RESUME_PAGE, EXT, client);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('開編輯器失敗不影響回給 content script 的結果', async () => {
    const send = vi.fn<BridgeClient['send']>(() => Promise.resolve({ ok: true }));
    const client = { send, close: vi.fn() } satisfies BridgeClient;
    const res = await handleRelay(relayMessage(RESUME), RESUME_PAGE, EXT, client, {
      registry: REGISTRY,
      onResumeCaptured: () => Promise.reject(new Error('tabs.create failed')),
    });
    expect(res).toEqual({ ok: true });
  });
});
