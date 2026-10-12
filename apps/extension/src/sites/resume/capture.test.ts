// @vitest-environment jsdom
import {
  RELAY_CHANNEL,
  RESUME_CAPTURE_MAX_BLOCKS,
  RESUME_CAPTURE_MAX_TEXT_BYTES,
  SubmitResumeCaptureRequest,
} from '@rolecraft/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildResumeCapture, resumeNoticeText, runResumeCapture } from './capture.ts';
import { applyLimits } from './limits.ts';
import { RESUME_FAILED_MESSAGE, RESUME_NOT_FOUND_MESSAGE } from './notice.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { ResumeBlock, ResumeSiteConfig } from './types.ts';

/** 全是假資料、假網址。 */
const CONFIG: ResumeSiteConfig = {
  platform: '104',
  rootSelector: '#resume',
  nameSelector: '.profile-name',
};
const PAGE_URL = 'https://resume.example.com/view/abc?token=secret&x=1#section';
const NOW = new Date('2026-10-12T08:00:00.000Z');

type Send = (message: unknown) => Promise<unknown>;

function deps(send: Send = () => Promise.resolve({ ok: true })) {
  return {
    doc: document,
    pageUrl: PAGE_URL,
    oracle: simpleOracle,
    now: () => NOW,
    sendToWorker: send,
  };
}

function setPage(html: string): void {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildResumeCapture', () => {
  it('組出通過 contracts schema 的請求：url 只取 origin＋路徑，nameText 可在根節點外', () => {
    setPage(
      '<header><span class="profile-name">  王 小明 </span><nav>站內訊息 3</nav></header>' +
        '<main id="resume"><h2>工作經歷</h2><ul><li>範例公司 工程師</li></ul></main>',
    );
    const request = buildResumeCapture(CONFIG, deps());
    expect(request).not.toBe('not_found');
    const parsed = SubmitResumeCaptureRequest.parse(request);
    expect(parsed.payload).toEqual({
      platform: '104',
      url: 'https://resume.example.com/view/abc',
      capturedAt: '2026-10-12T08:00:00.000Z',
      truncated: false,
      nameText: '王 小明',
      blocks: [
        { kind: 'heading', level: 2, label: null, text: '工作經歷', continues: false },
        { kind: 'list_item', level: 1, label: null, text: '範例公司 工程師', continues: false },
      ],
    });
    const json = JSON.stringify(parsed);
    for (const banned of ['token', 'secret', '#section', '站內訊息', '<']) {
      expect(json).not.toContain(banned);
    }
  });

  it('沒登記、找不到、隱藏、過長的姓名元素都是 null', () => {
    const body = '<div id="resume"><p>內容</p></div>';
    const nameOf = (config: ResumeSiteConfig, extra = '') => {
      setPage(extra + body);
      const request = buildResumeCapture(config, deps());
      if (typeof request === 'string') throw new Error(request);
      return request.payload.nameText;
    };
    expect(nameOf({ ...CONFIG, nameSelector: null })).toBeNull();
    expect(nameOf(CONFIG)).toBeNull();
    expect(
      nameOf(CONFIG, '<div style="display:none"><b class="profile-name">藏</b></div>'),
    ).toBeNull();
    expect(nameOf(CONFIG, `<b class="profile-name">${'名'.repeat(201)}</b>`)).toBeNull();
  });

  it('找不到根節點、根節點隱藏或沒有可讀內容：not_found', () => {
    setPage('<div id="other"><p>內容</p></div>');
    expect(buildResumeCapture(CONFIG, deps())).toBe('not_found');
    setPage('<div id="resume" hidden><p>內容</p></div>');
    expect(buildResumeCapture(CONFIG, deps())).toBe('not_found');
    setPage('<div id="resume"><img alt="照片"></div>');
    expect(buildResumeCapture(CONFIG, deps())).toBe('not_found');
    expect(buildResumeCapture({ ...CONFIG, rootSelector: '[[bad' }, deps())).toBe('not_found');
  });

  it('不符 schema（非 https 網址）：invalid，不送', () => {
    setPage('<div id="resume"><p>內容</p></div>');
    expect(buildResumeCapture(CONFIG, { ...deps(), pageUrl: 'http://resume.example.com/v' })).toBe(
      'invalid',
    );
  });
});

describe('上限', () => {
  const block = (text: string): ResumeBlock => ({
    kind: 'paragraph',
    level: null,
    label: null,
    text,
    continues: false,
  });

  it('區塊數超過：只留前 2,000 個並標截斷，請求通過 schema', () => {
    const items = Array.from(
      { length: RESUME_CAPTURE_MAX_BLOCKS + 1 },
      (_, i) => `<li>項目${i}</li>`,
    );
    setPage(`<ul id="resume">${items.join('')}</ul>`);
    const request = SubmitResumeCaptureRequest.parse(buildResumeCapture(CONFIG, deps()));
    expect(request.payload.blocks).toHaveLength(RESUME_CAPTURE_MAX_BLOCKS);
    expect(request.payload.truncated).toBe(true);
    expect(request.payload.blocks.at(-1)?.text).toBe(`項目${RESUME_CAPTURE_MAX_BLOCKS - 1}`);
  });

  it('文字超過 256 KiB：只送放得下的完整區塊（不切開、不跳過再接）', () => {
    const big = 'a'.repeat(100 * 1024);
    const limited = applyLimits([block(big), block(big), block(big), block('短')]);
    expect(limited.truncated).toBe(true);
    expect(limited.blocks).toHaveLength(2);
  });

  it('標籤算進合計；剛好等於上限不截斷', () => {
    const label = { ...block('x'), kind: 'label_value' as const, label: 'y' };
    const exact = block('a'.repeat(RESUME_CAPTURE_MAX_TEXT_BYTES - 2));
    expect(applyLimits([exact, label])).toEqual({ blocks: [exact, label], truncated: false });
    expect(applyLimits([exact, label, block('z')]).truncated).toBe(true);
  });

  it('多位元組字以 UTF-8 計算；截斷後的請求通過 schema 且低於 1 MiB', () => {
    const cjk = '字'.repeat(30_000);
    setPage(`<div id="resume">${Array.from({ length: 4 }, () => `<p>${cjk}</p>`).join('')}</div>`);
    const request = SubmitResumeCaptureRequest.parse(buildResumeCapture(CONFIG, deps()));
    expect(request.payload.blocks).toHaveLength(2);
    expect(request.payload.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThan(1024 * 1024);
  });
});

describe('runResumeCapture 與頁面提示文字', () => {
  it('找不到根節點：不送，提示規格的文字', async () => {
    setPage('<p>別的頁</p>');
    const send = vi.fn();
    const outcome = await runResumeCapture(CONFIG, deps(send));
    expect(send).not.toHaveBeenCalled();
    expect(resumeNoticeText(outcome)).toBe(RESUME_NOT_FOUND_MESSAGE);
    expect(RESUME_NOT_FOUND_MESSAGE).toBe(
      'RoleCraft：這一頁找不到履歷內容（可能不是支援的履歷檢視頁，或網站改版了），沒有擷取或送出任何內容。可以到 RoleCraft 編輯器改用「手動輸入」（在其他分頁點 RoleCraft 圖示開啟）。',
    );
  });

  it('成功：包成轉送訊息送一次，不提示', async () => {
    setPage('<div id="resume"><p>內容</p></div>');
    const send = vi.fn<(message: unknown) => Promise<unknown>>(() => Promise.resolve({ ok: true }));
    const outcome = await runResumeCapture(CONFIG, deps(send));
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as { channel: string; request: unknown };
    expect(Object.keys(message).sort()).toEqual(['channel', 'request']);
    expect(message.channel).toBe(RELAY_CHANNEL);
    expect(SubmitResumeCaptureRequest.safeParse(message.request).success).toBe(true);
    expect(resumeNoticeText(outcome)).toBeNull();
  });

  it.each([
    ['送出例外（連不上 service worker）', () => Promise.reject(new Error('x'))],
    [
      'helper 拒絕',
      () => Promise.resolve({ ok: false, error: { code: 'invalid_request', message: 'm' } }),
    ],
    [
      'helper 連不上',
      () => Promise.resolve({ ok: false, error: { code: 'helper_unavailable', message: 'm' } }),
    ],
    ['回應不符 schema', () => Promise.resolve({ ok: 'yes' })],
    ['沒有回應', () => Promise.resolve(undefined)],
  ])('%s：提示指向「手動輸入」的失敗文字', async (_name, impl) => {
    setPage('<div id="resume"><p>內容</p></div>');
    const outcome = await runResumeCapture(CONFIG, deps(vi.fn(impl)));
    expect(resumeNoticeText(outcome)).toBe(RESUME_FAILED_MESSAGE);
    expect(RESUME_FAILED_MESSAGE).toContain('「手動輸入」');
  });

  it('組出的請求不符 schema：不送、提示失敗', async () => {
    setPage('<div id="resume"><p>內容</p></div>');
    const send = vi.fn();
    const outcome = await runResumeCapture(CONFIG, { ...deps(send), pageUrl: 'not a url' });
    expect(send).not.toHaveBeenCalled();
    expect(resumeNoticeText(outcome)).toBe(RESUME_FAILED_MESSAGE);
  });
});
