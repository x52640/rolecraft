import { describe, expect, it } from 'vitest';

import {
  BRIDGE_MAX_IN_FLIGHT,
  BridgeRequestEnvelope,
  BridgeRequestId,
  BridgeResponseEnvelope,
  NATIVE_HOST_NAME,
  RELAY_CHANNEL,
} from '../index.ts';

const DRAFT = { op: 'request_draft', payload: { messageDraftId: 'm-1', replyIntent: '婉拒' } };

describe('共用常數', () => {
  it('host 名稱、轉送通道、在途上限只有這一份', () => {
    expect(NATIVE_HOST_NAME).toBe('com.rolecraft.helper');
    expect(RELAY_CHANNEL).toBe('rolecraft.bridge');
    expect(BRIDGE_MAX_IN_FLIGHT).toBe(32);
  });
});

describe('BridgeRequestId', () => {
  it.each(['r1', 'a', 'A-b_9', 'x'.repeat(64), '__proto__', 'constructor'])('接受 %s', (id) => {
    expect(BridgeRequestId.safeParse(id).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ['空字串', ''],
    ['超長（65 字）', 'x'.repeat(65)],
    ['數字', 1],
    ['null', null],
    ['物件', { id: 'a' }],
    ['陣列', ['a']],
    ['路徑', '../etc/passwd'],
    ['空白', 'a b'],
    ['中文', '請求'],
    ['換行', 'a\n'],
  ])('拒絕%s', (_name, id) => {
    expect(BridgeRequestId.safeParse(id).success).toBe(false);
  });
});

describe('信封', () => {
  it('request 信封：恰好 { id, request }，request 仍走 strict schema', () => {
    expect(BridgeRequestEnvelope.safeParse({ id: 'r1', request: DRAFT }).success).toBe(true);
    expect(BridgeRequestEnvelope.safeParse({ request: DRAFT }).success).toBe(false);
    expect(BridgeRequestEnvelope.safeParse({ id: 'r1', request: DRAFT, cwd: '/' }).success).toBe(
      false,
    );
    const bad = { ...DRAFT, payload: { ...DRAFT.payload, path: '/etc' } };
    expect(BridgeRequestEnvelope.safeParse({ id: 'r1', request: bad }).success).toBe(false);
  });

  it('response 信封：id 可為 null（協定錯誤），response 必須是帶 ok 的物件', () => {
    const failure = { ok: false, error: { code: 'invalid_request', message: 'x' } };
    expect(BridgeResponseEnvelope.safeParse({ id: 'r1', response: { ok: true } }).success).toBe(
      true,
    );
    expect(BridgeResponseEnvelope.safeParse({ id: null, response: failure }).success).toBe(true);
    expect(BridgeResponseEnvelope.safeParse({ response: { ok: true } }).success).toBe(false);
    expect(BridgeResponseEnvelope.safeParse({ id: 'r1' }).success).toBe(false);
    expect(BridgeResponseEnvelope.safeParse({ id: 'r1', response: 'ok' }).success).toBe(false);
    expect(BridgeResponseEnvelope.safeParse({ id: 1, response: { ok: true } }).success).toBe(false);
    expect(
      BridgeResponseEnvelope.safeParse({ id: 'r1', response: { ok: true }, extra: 1 }).success,
    ).toBe(false);
  });
});
