import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeClient, type NativePort } from './client.ts';

class FakePort implements NativePort {
  sent: unknown[] = [];
  disconnected = false;
  private messageListeners: ((m: unknown) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  onMessage = { addListener: (cb: (m: unknown) => void) => void this.messageListeners.push(cb) };
  onDisconnect = { addListener: (cb: () => void) => void this.disconnectListeners.push(cb) };
  private readonly reply: ((m: unknown) => unknown) | undefined;
  constructor(reply?: (m: unknown) => unknown) {
    this.reply = reply;
  }
  postMessage(message: unknown): void {
    this.sent.push(message);
    if (this.reply) {
      const r = this.reply(message);
      queueMicrotask(() => this.emit(r));
    }
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(message: unknown): void {
    for (const cb of this.messageListeners) cb(message);
  }
  hostDisconnect(): void {
    for (const cb of this.disconnectListeners) cb();
  }
}

const OPEN = { op: 'open_editor', payload: {} };
const DRAFT = { op: 'request_draft', payload: { messageDraftId: 'm-1', replyIntent: '婉拒' } };

function setup(reply?: (m: unknown) => unknown, lastError?: string) {
  const ports: FakePort[] = [];
  const client = createBridgeClient({
    connect: () => {
      const p = new FakePort(reply);
      ports.push(p);
      return p;
    },
    lastError: () => lastError,
    timeoutMs: 1000,
  });
  return { client, ports };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('bridge client', () => {
  it('合法請求送出，合法回應原樣回傳', async () => {
    const { client, ports } = setup(() => ({ ok: true }));
    await expect(client.send(OPEN)).resolves.toEqual({ ok: true });
    expect(ports[0]?.sent).toEqual([OPEN]);
  });

  it.each([
    ['未知操作', { op: 'run_command', payload: { cmd: 'ls' } }],
    ['送出訊息不在清單（D7）', { op: 'send_message', payload: {} }],
    ['多帶路徑欄位', { ...OPEN, payload: { path: '/etc/passwd' } }],
    ['頂層多帶欄位', { ...OPEN, cwd: '/tmp' }],
    ['不是物件', 'open_editor'],
  ])('%s：本地拒絕，不連線', async (_name, bad) => {
    const { client, ports } = setup(() => ({ ok: true }));
    const res = await client.send(bad);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(ports).toHaveLength(0);
  });

  it.each([
    ['型別不符', { ok: true, workJobId: 123 }],
    ['多帶欄位', { ok: true, workJobId: 'w-1', extra: 1 }],
    ['未知錯誤代碼', { ok: false, error: { code: 'teapot', message: 'x' } }],
    ['不是物件', 'ok'],
  ])('回應%s：轉成 internal_error 並斷線', async (_name, badReply) => {
    const { client, ports } = setup(() => badReply);
    const res = await client.send(DRAFT);
    expect(res).toMatchObject({ ok: false, error: { code: 'internal_error' } });
    expect(ports[0]?.disconnected).toBe(true);
  });

  it('helper 回的失敗回應合法就原樣回傳', async () => {
    const failure = { ok: false, error: { code: 'invalid_request', message: '不行' } };
    const { client } = setup(() => failure);
    await expect(client.send(OPEN)).resolves.toEqual(failure);
  });

  it('同時多個請求依序送出，一次只有一則在途', async () => {
    const { client, ports } = setup();
    const a = client.send(OPEN);
    const b = client.send(DRAFT);
    await vi.waitFor(() => expect(ports[0]?.sent).toHaveLength(1));
    ports[0]?.emit({ ok: true });
    await expect(a).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(ports[0]?.sent).toHaveLength(2));
    ports[0]?.emit({ ok: true, workJobId: 'w-1' });
    await expect(b).resolves.toEqual({ ok: true, workJobId: 'w-1' });
    expect(ports).toHaveLength(1);
  });

  it('host 斷線：在途請求回 internal_error 帶原因，下次重連', async () => {
    const { client, ports } = setup(undefined, 'Specified native messaging host not found.');
    const a = client.send(OPEN);
    await vi.waitFor(() => expect(ports[0]?.sent).toHaveLength(1));
    ports[0]?.hostDisconnect();
    const res = await a;
    expect(res).toMatchObject({ ok: false, error: { code: 'internal_error' } });
    expect(JSON.stringify(res)).toContain('not found');
    const b = client.send(OPEN);
    await vi.waitFor(() => expect(ports).toHaveLength(2));
    ports[1]?.emit({ ok: true });
    await expect(b).resolves.toEqual({ ok: true });
  });

  it('逾時：回 internal_error 並斷線，晚到的回覆不會配給下一個請求', async () => {
    vi.useFakeTimers();
    const { client, ports } = setup();
    const a = client.send(OPEN);
    await vi.waitFor(() => expect(ports[0]?.sent).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(a).resolves.toMatchObject({ ok: false, error: { code: 'internal_error' } });
    expect(ports[0]?.disconnected).toBe(true);
    const b = client.send(DRAFT);
    await vi.waitFor(() => expect(ports).toHaveLength(2));
    ports[0]?.emit({ ok: true }); // 舊連線晚到
    ports[1]?.emit({ ok: true, workJobId: 'w-2' });
    await expect(b).resolves.toEqual({ ok: true, workJobId: 'w-2' });
  });

  it('沒人在等時收到訊息：視為順序錯亂，斷線', async () => {
    const { client, ports } = setup(() => ({ ok: true }));
    await client.send(OPEN);
    ports[0]?.emit({ ok: true });
    expect(ports[0]?.disconnected).toBe(true);
  });
});
