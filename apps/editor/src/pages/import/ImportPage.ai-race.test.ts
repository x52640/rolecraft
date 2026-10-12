// @vitest-environment jsdom
// P1-T089：ImportPage.web.test.ts「AI 失敗」偶發失敗的回歸測試。開啟核對後，useAiParse「換核對」的
// passive effect 可能晚於使用者按「用 AI 整理」才執行（React 排程讓出時），舊版會把剛送出的那次整理作廢：
// import.ai_parse 已送出、結果卻被丟掉，畫面卡在未整理。這裡讓排程每個工作都讓出（performance.now 每次
// 前進 10ms），並在開啟核對畫面一出現（MutationObserver，passive effect 執行前）就按「用 AI 整理」。
// 全部是假通道；內容為合成資料。
import type { ImportResult } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const CAPTURED_AT = '2026-10-12T08:00:00.000Z';
const WEB: ImportResult = {
  status: 'web_capture',
  displayName: '網頁：104',
  platform: '104',
  capturedAt: CAPTURED_AT,
  truncated: false,
  blocks: [
    { id: 'b1', kind: 'paragraph', level: null, label: null, text: '範例科技', continues: false },
  ],
};
const FAILED = {
  ok: true,
  parse: { state: 'failed', failure: 'provider_error', draft: null, source: 'web', webDraft: null },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<ImportPage /> 開啟核對後立刻按「用 AI 整理」（P1-T089 偶發失敗）', () => {
  it('換核對的 effect 晚到也不作廢這次整理：送出一次、結果照常顯示', async () => {
    const replies: Record<string, unknown> = {
      'import.latest_capture': {
        ok: true,
        capture: { importId: 'web-1', platform: '104', capturedAt: CAPTURED_AT, truncated: false },
      },
      'import.get': { ok: true, result: WEB },
      'import.ai_parse': FAILED,
      'profile.get': { ok: true, profile: null },
    };
    const send = vi.fn<BridgeTransport['send']>((raw) =>
      Promise.resolve(replies[(raw as { op: string }).op]),
    );
    const page = createElement(ImportPage, { aiPoll: { intervalMs: 1, maxPolls: 5 } });
    render(createElement(BridgeProvider, { transport: { send }, children: page }));
    fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));

    let now = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
    let clicked = false;
    const observer = new MutationObserver(() => {
      const button = screen.queryByRole('button', { name: '用 AI 整理' });
      if (clicked || !button) return;
      clicked = true;
      button.click();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      await screen.findByText(/AI 整理沒有完成/u, undefined, { timeout: 3000 });
    } finally {
      observer.disconnect();
    }
    expect(clicked).toBe(true);
    const aiCalls = send.mock.calls.filter(([r]) => (r as { op: string }).op === 'import.ai_parse');
    expect(aiCalls).toHaveLength(1);
  });
});
