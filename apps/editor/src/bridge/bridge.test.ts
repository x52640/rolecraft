// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider, useBridge } from './BridgeProvider.tsx';
import { createEditorBridge } from './client.ts';
import { createRuntimeTransport, RELAY_CHANNEL, type BridgeTransport } from './transport.ts';

const OPEN = { op: 'open_editor', payload: {} } as const;
const DRAFT = {
  op: 'request_draft',
  payload: { messageDraftId: 'm-1', replyIntent: '婉拒' },
} as const;

/** reply 是函式時呼叫它取得回覆（可模擬失敗），否則直接回 reply。 */
function fakeTransport(reply: unknown) {
  const send = vi.fn<BridgeTransport['send']>(() =>
    typeof reply === 'function' ? (reply as () => Promise<unknown>)() : Promise.resolve(reply),
  );
  return { transport: { send } satisfies BridgeTransport, send };
}

afterEach(cleanup);

describe('createEditorBridge', () => {
  it('合法請求：送出並回傳驗證過的回應', async () => {
    const { transport, send } = fakeTransport({ ok: true });
    expect(await createEditorBridge(transport).send(OPEN)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(OPEN);
  });

  it.each<[string, unknown]>([
    ['多帶 path 欄位', { op: 'open_editor', payload: { path: '/etc/passwd' } }],
    ['未知操作', { op: 'run_command', payload: { cmd: 'ls' } }],
  ])('%s：回 invalid_request 且不送出', async (_name, request) => {
    const { transport, send } = fakeTransport({ ok: true });
    // 故意繞過型別，模擬執行期送進不合法的東西。
    const res = await createEditorBridge(transport).send(request as typeof OPEN);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('回應不符 schema：回 internal_error', async () => {
    const { transport } = fakeTransport({ ok: true, workJobId: 123 });
    const res = await createEditorBridge(transport).send(DRAFT);
    expect(res).toMatchObject({ ok: false, error: { code: 'internal_error' } });
  });

  it('轉送失敗：回 internal_error，不丟例外', async () => {
    const { transport } = fakeTransport(() => Promise.reject(new Error('Receiving end')));
    const res = await createEditorBridge(transport).send(OPEN);
    expect(res).toMatchObject({ ok: false, error: { code: 'internal_error' } });
  });

  it('不在擴充功能頁（沒有通道）：回 internal_error', async () => {
    const res = await createEditorBridge(null).send(OPEN);
    expect(res).toMatchObject({ ok: false, error: { code: 'internal_error' } });
  });
});

describe('createRuntimeTransport', () => {
  it('包成 { channel, request } 交給 chrome.runtime.sendMessage', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ ok: true }));
    const transport = createRuntimeTransport({ id: 'ext', sendMessage });
    await transport?.send(OPEN);
    expect(sendMessage).toHaveBeenCalledWith({ channel: RELAY_CHANNEL, request: OPEN });
    expect(RELAY_CHANNEL).toBe('rolecraft.bridge');
  });

  it('不在擴充功能頁時回 null', () => {
    expect(createRuntimeTransport()).toBeNull();
  });
});

describe('useBridge', () => {
  it('在 BridgeProvider 內取得客戶端並經注入的通道送出', async () => {
    const { transport, send } = fakeTransport({ ok: true });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(BridgeProvider, { transport, children });
    const { result } = renderHook(() => useBridge(), { wrapper });
    expect(await result.current.send(OPEN)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('不在 BridgeProvider 內使用會丟錯', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useBridge())).toThrow('BridgeProvider');
  });
});
