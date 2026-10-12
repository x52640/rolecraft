import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BRIDGE_PICKER_OPERATIONS,
  BRIDGE_PICKER_TIMEOUT_MS,
  PICKER_DIALOG_TIMEOUT_MS,
} from '@rolecraft/contracts';

import { createBridgeClient, type NativePort } from './client.ts';
import { DEFAULT_TIMEOUT_MS } from './host.ts';

interface Sent {
  id: string;
  request: { op: string };
}

class FakePort implements NativePort {
  sent: Sent[] = [];
  disconnected = false;
  throwOnPost = false;
  private messageListeners: ((m: unknown) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  onMessage = { addListener: (cb: (m: unknown) => void) => void this.messageListeners.push(cb) };
  onDisconnect = { addListener: (cb: () => void) => void this.disconnectListeners.push(cb) };
  private readonly reply: ((m: Sent) => unknown) | undefined;
  constructor(reply?: (m: Sent) => unknown) {
    this.reply = reply;
  }
  postMessage(message: unknown): void {
    if (this.throwOnPost) throw new Error('Attempting to use a disconnected port object');
    const m = message as Sent;
    this.sent.push(m);
    if (this.reply) {
      const r = this.reply(m);
      queueMicrotask(() => this.emit({ id: m.id, response: r }));
    }
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(message: unknown): void {
    for (const cb of this.messageListeners) cb(message);
  }
  /** 以第 i 則送出的 id 回覆。 */
  answer(i: number, response: unknown): void {
    this.emit({ id: this.sent[i]?.id, response });
  }
  hostDisconnect(): void {
    for (const cb of this.disconnectListeners) cb();
  }
}

const MSG = {
  op: 'submit_message_capture',
  payload: {
    platform: 'cake',
    captureMethod: 'auto',
    selectedMessageText: 'hi',
    jobSnapshotId: null,
  },
};
const DRAFT = { op: 'request_draft', payload: { messageDraftId: 'm-1', replyIntent: '婉拒' } };
const MSG_OK = { ok: true, messageDraftId: 'm-1' };
const DRAFT_OK = { ok: true, workJobId: 'w-1' };

function setup(
  reply?: (m: Sent) => unknown,
  opts: { lastError?: string; maxInFlight?: number } = {},
) {
  const ports: FakePort[] = [];
  const client = createBridgeClient({
    connect: () => {
      const p = new FakePort(reply);
      ports.push(p);
      return p;
    },
    lastError: () => opts.lastError,
    timeoutMs: 1000,
    ...(opts.maxInFlight === undefined ? {} : { maxInFlight: opts.maxInFlight }),
  });
  return { client, ports };
}

const anyString: unknown = expect.any(String);
const code = (c: string) => ({ ok: false, error: { code: c, message: anyString } });

afterEach(() => {
  vi.useRealTimers();
});

describe('bridge client：基本往返', () => {
  it('合法請求包成 { id, request } 送出，依 id 取回應', async () => {
    const { client, ports } = setup(() => MSG_OK);
    await expect(client.send(MSG)).resolves.toEqual(MSG_OK);
    expect(ports[0]?.sent).toEqual([{ id: 'r1', request: MSG }]);
  });

  it.each([
    ['未知操作', { op: 'run_command', payload: { cmd: 'ls' } }],
    ['送出訊息不在清單（D7）', { op: 'send_message', payload: {} }],
    ['open_editor 已移除', { op: 'open_editor', payload: {} }],
    ['多帶路徑欄位', { ...DRAFT, payload: { ...DRAFT.payload, path: '/etc/passwd' } }],
    ['頂層多帶欄位', { ...DRAFT, cwd: '/tmp' }],
    ['頁面自帶 id（信封由 service worker 包）', { id: 'r9', request: DRAFT }],
    ['不是物件', 'request_draft'],
  ])('%s：本地拒絕，不連線', async (_name, bad) => {
    const { client, ports } = setup(() => DRAFT_OK);
    expect(await client.send(bad)).toEqual(code('invalid_request'));
    expect(ports).toHaveLength(0);
  });

  it.each([
    ['型別不符', { ok: true, workJobId: 123 }],
    ['多帶欄位', { ok: true, workJobId: 'w-1', extra: 1 }],
    ['未知錯誤代碼', { ok: false, error: { code: 'teapot', message: 'x' } }],
    ['別的操作的成功形狀', MSG_OK],
  ])('回應%s：該請求回 internal_error，連線保留', async (_name, badReply) => {
    const { client, ports } = setup((m) => (m.request.op === 'request_draft' ? badReply : MSG_OK));
    expect(await client.send(DRAFT)).toEqual(code('internal_error'));
    expect(ports[0]?.disconnected).toBe(false);
    await expect(client.send(MSG)).resolves.toEqual(MSG_OK);
    expect(ports).toHaveLength(1);
  });

  it.each(['invalid_request', 'not_implemented', 'internal_error'])(
    'helper 回的 %s 失敗合法就原樣回傳',
    async (c) => {
      const failure = { ok: false, error: { code: c, message: '不行' } };
      const { client } = setup(() => failure);
      await expect(client.send(DRAFT)).resolves.toEqual(failure);
    },
  );
});

describe('bridge client：請求 id 與並行', () => {
  it('同時多則：全部立即送出，亂序回覆依 id 對回各自請求', async () => {
    const { client, ports } = setup();
    const a = client.send(MSG);
    const b = client.send(DRAFT);
    const c = client.send(DRAFT);
    const port = ports[0];
    expect(port?.sent.map((s) => s.id)).toEqual(['r1', 'r2', 'r3']);
    port?.answer(2, { ok: true, workJobId: 'w-3' });
    port?.answer(0, MSG_OK);
    port?.answer(1, { ok: true, workJobId: 'w-2' });
    expect(await Promise.all([a, b, c])).toEqual([
      MSG_OK,
      { ok: true, workJobId: 'w-2' },
      { ok: true, workJobId: 'w-3' },
    ]);
    expect(port?.disconnected).toBe(false);
  });

  it('id 在客戶端生命週期內不重複，重連後也不重用', async () => {
    const { client, ports } = setup(() => DRAFT_OK);
    await client.send(DRAFT);
    ports[0]?.hostDisconnect();
    await client.send(DRAFT);
    await client.send(DRAFT);
    const ids = ports.flatMap((p) => p.sent.map((s) => s.id));
    expect(ids).toEqual(['r1', 'r2', 'r3']);
  });

  it('在途達上限：多的請求排隊，有回覆才送出（不讓 helper 因超量斷線）', async () => {
    const { client, ports } = setup(undefined, { maxInFlight: 2 });
    const a = client.send(DRAFT);
    const b = client.send(DRAFT);
    const c = client.send(MSG);
    const port = ports[0];
    expect(port?.sent).toHaveLength(2);
    port?.answer(1, DRAFT_OK);
    await expect(b).resolves.toEqual(DRAFT_OK);
    expect(port?.sent).toHaveLength(3);
    expect(port?.sent[2]?.request).toEqual(MSG);
    port?.answer(0, DRAFT_OK);
    port?.answer(2, MSG_OK);
    expect(await Promise.all([a, c])).toEqual([DRAFT_OK, MSG_OK]);
  });
});

describe('bridge client：協定錯誤一律斷線', () => {
  it.each<[string, (p: FakePort) => void]>([
    ['未知 id', (p) => p.emit({ id: 'r999', response: DRAFT_OK })],
    [
      'id 為 null（helper 回報協定錯誤）',
      (p) => p.emit({ id: null, response: code('invalid_request') }),
    ],
    ['缺 id', (p) => p.emit({ response: DRAFT_OK })],
    ['id 不是字串', (p) => p.emit({ id: 1, response: DRAFT_OK })],
    ['id 超長', (p) => p.emit({ id: 'x'.repeat(65), response: DRAFT_OK })],
    ['信封多帶欄位', (p) => p.emit({ id: p.sent[0]?.id, response: DRAFT_OK, path: '/x' })],
    ['舊格式（沒有信封）', (p) => p.emit(DRAFT_OK)],
    ['不是物件', (p) => p.emit('ok')],
  ])('%s：斷線，在途請求回 internal_error', async (_name, act) => {
    const { client, ports } = setup();
    const a = client.send(DRAFT);
    const port = ports[0] as FakePort;
    act(port);
    expect(await a).toEqual(code('internal_error'));
    expect(port.disconnected).toBe(true);
    // 之後重連照常
    const b = client.send(DRAFT);
    ports[1]?.answer(0, DRAFT_OK);
    await expect(b).resolves.toEqual(DRAFT_OK);
  });

  it('同一 id 回兩次：第二次視為未知 id，斷線', async () => {
    const { client, ports } = setup();
    const a = client.send(DRAFT);
    const b = client.send(DRAFT);
    const port = ports[0] as FakePort;
    port.answer(0, DRAFT_OK);
    await expect(a).resolves.toEqual(DRAFT_OK);
    port.answer(0, DRAFT_OK);
    expect(await b).toEqual(code('internal_error'));
    expect(port.disconnected).toBe(true);
  });

  it('舊連線晚到的訊息被忽略，不影響新連線', async () => {
    const { client, ports } = setup();
    const a = client.send(DRAFT);
    ports[0]?.hostDisconnect();
    await a;
    const b = client.send(DRAFT);
    ports[0]?.emit({ id: 'r999', response: DRAFT_OK });
    ports[1]?.answer(0, DRAFT_OK);
    await expect(b).resolves.toEqual(DRAFT_OK);
    expect(ports[1]?.disconnected).toBe(false);
  });
});

describe('bridge client：helper_unavailable 與 timeout', () => {
  it('host 斷線（例如未安裝）：在途請求回 helper_unavailable 帶原因，下次重連', async () => {
    const { client, ports } = setup(undefined, {
      lastError: 'Specified native messaging host not found.',
    });
    const a = client.send(DRAFT);
    const b = client.send(MSG);
    ports[0]?.hostDisconnect();
    const res = await a;
    expect(res).toEqual(code('helper_unavailable'));
    expect(JSON.stringify(res)).toContain('not found');
    expect(await b).toEqual(code('helper_unavailable'));
    const c = client.send(DRAFT);
    ports[1]?.answer(0, DRAFT_OK);
    await expect(c).resolves.toEqual(DRAFT_OK);
  });

  it('送出時丟例外：回 helper_unavailable', async () => {
    const { client, ports } = setup();
    const a = client.send(DRAFT);
    ports[0]?.answer(0, DRAFT_OK);
    await a;
    (ports[0] as FakePort).throwOnPost = true;
    expect(await client.send(DRAFT)).toEqual(code('helper_unavailable'));
    expect(ports[0]?.disconnected).toBe(true);
  });

  it('connect 本身丟例外：回 helper_unavailable', async () => {
    const client = createBridgeClient({
      connect: () => {
        throw new Error('nativeMessaging permission missing');
      },
      lastError: () => undefined,
    });
    expect(await client.send(DRAFT)).toEqual(code('helper_unavailable'));
  });

  it('close：在途請求回 helper_unavailable', async () => {
    const { client, ports } = setup();
    const a = client.send(DRAFT);
    client.close();
    expect(await a).toEqual(code('helper_unavailable'));
    expect(ports[0]?.disconnected).toBe(true);
  });

  it('逾時：只有該請求回 timeout，連線保留，晚到回覆被丟棄不配給別人', async () => {
    vi.useFakeTimers();
    const { client, ports } = setup();
    const slow = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(600);
    const other = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(400);
    expect(await slow).toEqual(code('timeout'));
    const port = ports[0] as FakePort;
    expect(port.disconnected).toBe(false);
    port.answer(0, { ok: true, workJobId: 'late' }); // 晚到
    port.answer(1, DRAFT_OK);
    await expect(other).resolves.toEqual(DRAFT_OK);
    expect(port.disconnected).toBe(false);
    expect(ports).toHaveLength(1);
  });

  it('逾時的請求在 helper 回覆前仍占名額；晚到回覆後釋放', async () => {
    vi.useFakeTimers();
    const { client, ports } = setup(undefined, { maxInFlight: 2 });
    const a = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await a).toEqual(code('timeout'));
    const b = client.send(DRAFT);
    const c = client.send(MSG);
    const port = ports[0] as FakePort;
    expect(port.sent).toHaveLength(2); // a 仍占名額，c 排隊
    port.answer(0, DRAFT_OK); // a 晚到
    expect(port.sent).toHaveLength(3);
    port.answer(1, DRAFT_OK);
    port.answer(2, MSG_OK);
    expect(await Promise.all([b, c])).toEqual([DRAFT_OK, MSG_OK]);
  });

  it('名額全被逾時請求占住（helper 疑似卡死）：斷線重來，排隊的請求改走新連線', async () => {
    vi.useFakeTimers();
    const { client, ports } = setup(undefined, { maxInFlight: 1 });
    const a = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(500);
    const queued = client.send(MSG);
    expect(ports[0]?.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(await a).toEqual(code('timeout'));
    expect(ports[0]?.disconnected).toBe(true);
    expect(ports[1]?.sent.map((s) => s.request)).toEqual([MSG]);
    ports[1]?.answer(0, MSG_OK);
    await expect(queued).resolves.toEqual(MSG_OK);
    ports[0]?.answer(0, DRAFT_OK); // 舊連線晚到：忽略
    expect(ports[1]?.disconnected).toBe(false);
  });
});

describe('bridge client：選取器操作的逾時配合原生對話框（P1-T045）', () => {
  const PICK_PDF = { op: 'import.pick_pdf', payload: {} };
  const PICK_FOLDERS = { op: 'sources.pick_folders', payload: {} };
  const PICKED = { ok: true, selection: { status: 'cancelled' } };

  /** 不覆寫逾時，測正式預設值。 */
  function setupDefaults() {
    const ports: FakePort[] = [];
    const client = createBridgeClient({
      connect: () => {
        const p = new FakePort();
        ports.push(p);
        return p;
      },
      lastError: () => undefined,
    });
    return { client, ports };
  }

  async function isSettled(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    void promise.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    return settled;
  }

  it('選取器逾時大於對話框上限，一般操作維持 30 秒', () => {
    expect(BRIDGE_PICKER_OPERATIONS).toEqual([
      'import.pick_pdf',
      'sources.pick_folders',
      'photo.pick',
    ]);
    expect(BRIDGE_PICKER_TIMEOUT_MS).toBeGreaterThan(PICKER_DIALOG_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it.each([PICK_PDF, PICK_FOLDERS])('$op：31 秒時仍在等', async (req) => {
    vi.useFakeTimers();
    const { client } = setupDefaults();
    const result = client.send(req);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await isSettled(result)).toBe(false);
  });

  it.each([PICK_PDF, PICK_FOLDERS])('$op：接近對話框上限才選好，結果照樣送回', async (req) => {
    vi.useFakeTimers();
    const { client, ports } = setupDefaults();
    const result = client.send(req);
    await vi.advanceTimersByTimeAsync(PICKER_DIALOG_TIMEOUT_MS - 1000);
    ports[0]?.answer(0, PICKED);
    await expect(result).resolves.toEqual(PICKED);
  });

  it.each([PICK_PDF, PICK_FOLDERS])('$op：超過選取器逾時仍回 timeout', async (req) => {
    vi.useFakeTimers();
    const { client } = setupDefaults();
    const result = client.send(req);
    await vi.advanceTimersByTimeAsync(BRIDGE_PICKER_TIMEOUT_MS - 1);
    expect(await isSettled(result)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(code('timeout'));
  });

  it('一般操作仍在 30 秒逾時，不受在途選取器影響', async () => {
    vi.useFakeTimers();
    const { client } = setupDefaults();
    const picker = client.send(PICK_PDF);
    const normal = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(await normal).toEqual(code('timeout'));
    expect(await isSettled(picker)).toBe(false);
  });

  it('timeoutMs 覆寫只影響一般操作，選取器操作另用 pickerTimeoutMs', async () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const client = createBridgeClient({
      connect: () => {
        const p = new FakePort();
        ports.push(p);
        return p;
      },
      lastError: () => undefined,
      timeoutMs: 1000,
      pickerTimeoutMs: 5000,
    });
    const picker = client.send(PICK_FOLDERS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await isSettled(picker)).toBe(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await picker).toEqual(code('timeout'));
  });
});

describe('bridge client：選取器不拖延卡死偵測、計時從送出起算（P1-T045 對抗驗證）', () => {
  const PICK_PDF = { op: 'import.pick_pdf', payload: {} };
  const PICKED = { ok: true, selection: { status: 'cancelled' } };

  function setupPicker(maxInFlight: number) {
    const ports: FakePort[] = [];
    const client = createBridgeClient({
      connect: () => {
        const p = new FakePort();
        ports.push(p);
        return p;
      },
      lastError: () => undefined,
      timeoutMs: 1000,
      pickerTimeoutMs: 10_000,
      maxInFlight,
    });
    return { client, ports };
  }

  it('1 個選取器在途＋其餘名額被逾時請求占住：排隊請求逾時即斷線重來', async () => {
    vi.useFakeTimers();
    const { client, ports } = setupPicker(3);
    const picker = client.send(PICK_PDF);
    const a = client.send(DRAFT);
    const b = client.send(DRAFT);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await Promise.all([a, b])).toEqual([code('timeout'), code('timeout')]);
    expect(ports[0]?.disconnected).toBe(false); // 選取器可能還在合理等待中
    const queued = client.send(MSG);
    expect(ports[0]?.sent).toHaveLength(3); // 名額滿，排隊
    await vi.advanceTimersByTimeAsync(1000);
    expect(await queued).toEqual(code('timeout'));
    expect(ports[0]?.disconnected).toBe(true);
    expect(await picker).toEqual(code('helper_unavailable'));
    const next = client.send(MSG); // 新連線立即送出，不再整整等選取器逾時
    expect(ports[1]?.sent.map((s) => s.request)).toEqual([MSG]);
    ports[1]?.answer(0, MSG_OK);
    await expect(next).resolves.toEqual(MSG_OK);
  });

  it('名額全是在途選取器（沒有逾時請求）：排隊逾時不斷線', async () => {
    vi.useFakeTimers();
    const { client, ports } = setupPicker(1);
    const picker = client.send(PICK_PDF);
    const queued = client.send(MSG);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await queued).toEqual(code('timeout'));
    expect(ports[0]?.disconnected).toBe(false);
    ports[0]?.answer(0, PICKED);
    await expect(picker).resolves.toEqual(PICKED);
  });

  it('選取器的長逾時從實際送出起算，排隊時間不吃掉解析餘裕', async () => {
    vi.useFakeTimers();
    const { client, ports } = setupPicker(1);
    const first = client.send(DRAFT);
    const picker = client.send(PICK_PDF);
    await vi.advanceTimersByTimeAsync(900);
    ports[0]?.answer(0, DRAFT_OK);
    await expect(first).resolves.toEqual(DRAFT_OK);
    expect(ports[0]?.sent).toHaveLength(2); // 選取器在 900 ms 才送出
    await vi.advanceTimersByTimeAsync(10_000 - 1);
    ports[0]?.answer(1, PICKED);
    await expect(picker).resolves.toEqual(PICKED);
  });

  it('選取器排隊超過一般上限：未送出就回 timeout', async () => {
    vi.useFakeTimers();
    const { client, ports } = setupPicker(1);
    const inFlight = client.send(PICK_PDF);
    const queuedPicker = client.send(PICK_PDF);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await queuedPicker).toEqual({
      ok: false,
      error: { code: 'timeout', message: '等待本機輔助程式回覆逾時（1000 ms）' },
    });
    expect(ports[0]?.sent).toHaveLength(1);
    ports[0]?.answer(0, PICKED);
    await expect(inFlight).resolves.toEqual(PICKED);
    expect(ports[0]?.sent).toHaveLength(1); // 已逾時的排隊請求不會再送
  });
});
