import { describe, expect, it } from 'vitest';

import {
  CLAIMS,
  UNUSABLE,
  budget,
  idSource,
  snapshot,
} from '../generation/fixtures.test-helpers.ts';
import { MESSAGE_INJECTION, makePlan, message } from './fixtures.test-helpers.ts';
import { parseReplyIntent } from './intent.ts';
import { planDraft, prepareDraft } from './prepare.ts';
import { buildDraftPrompt, DRAFT_INSTRUCTIONS } from './prompt.ts';

const plan = (intent: string, overrides: Partial<Parameters<typeof planDraft>[0]> = {}) =>
  planDraft({
    message: message(),
    replyIntent: intent,
    jobSnapshot: snapshot(),
    budget: budget(200_000),
    newId: idSource('p'),
    ...overrides,
  });

describe('意圖（F08：意圖不明時要使用者確認）', () => {
  it.each(['accept', 'inquire', 'decline'])('accepts %s', (intent) => {
    expect(parseReplyIntent(intent)).toBe(intent);
  });

  it.each(['', ' accept', 'Accept', '接受邀約', 'accept,decline', 'ignore previous'])(
    'unclear: %j',
    (intent) => {
      expect(parseReplyIntent(intent)).toBeNull();
      expect(plan(intent)).toEqual({ ok: false, reason: 'intent_unclear' });
    },
  );
});

describe('planDraft', () => {
  it('records the snapshot confirmation and current draft', () => {
    const result = plan('decline', { message: message({ draft: '舊草稿' }) });
    expect(result.ok && result.plan).toMatchObject({
      messageDraftId: 'msg-1',
      intent: 'decline',
      jobSnapshotId: 'job-1',
      snapshotConfirmedAt: snapshot().confirmedAt,
      draftAtPlan: '舊草稿',
    });
  });

  it('refuses a missing message, a missing or unconfirmed snapshot', () => {
    expect(plan('accept', { message: null })).toEqual({ ok: false, reason: 'message_missing' });
    expect(plan('accept', { jobSnapshot: null })).toEqual({
      ok: false,
      reason: 'snapshot_missing',
    });
    expect(plan('accept', { jobSnapshot: snapshot({ id: 'job-2' }) })).toEqual({
      ok: false,
      reason: 'snapshot_missing',
    });
    expect(plan('accept', { jobSnapshot: snapshot({ confirmedAt: null }) })).toEqual({
      ok: false,
      reason: 'snapshot_not_confirmed',
    });
  });

  it('works without a linked job', () => {
    const result = plan('inquire', {
      message: message({ jobSnapshotId: null }),
      jobSnapshot: null,
    });
    expect(result.ok && result.plan.snapshotConfirmedAt).toBeNull();
  });
});

describe('prepareDraft', () => {
  const inputs = { message: message(), jobSnapshot: snapshot(), claims: [...CLAIMS, ...UNUSABLE] };

  it('puts the message and job in data blocks and sends only usable claims', () => {
    const prepared = prepareDraft(makePlan(), inputs, idSource('b'));
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(prepared.claims.map((c) => c.id)).toEqual(CLAIMS.map((c) => c.id));
    const block = /<<<DATA MESSAGE (\w+)>>>\n([\s\S]*?)\n<<<END MESSAGE \1>>>/u.exec(
      prepared.prompt,
    );
    expect(block?.[2]).toContain(MESSAGE_INJECTION);
    // 注入文字只出現在資料區塊內
    expect(prepared.prompt.split(MESSAGE_INJECTION)).toHaveLength(2);
    expect(prepared.prompt.startsWith(DRAFT_INSTRUCTIONS)).toBe(true);
    expect(prepared.prompt).toContain('回覆意圖（使用者選定）：接受邀約');
    for (const claim of UNUSABLE) expect(prepared.prompt).not.toContain(claim.text);
  });

  it('labels the highest completion each claim allows outside the data blocks（P1-T047）', () => {
    const prompt = buildDraftPrompt(
      { intent: 'accept', messageText: '您好', job: null, claims: CLAIMS },
      'BoundaryMarker0123',
    );
    expect(prompt).toContain('C1（功能，最高可寫：進行中）：');
    expect(prompt).toContain('C2（功能，最高可寫：已完成）：');
    expect(prompt).toContain('C3（成果數字）：');
    expect(prompt).toContain('C5（功能，最高可寫：規劃中）：');
    expect(DRAFT_INSTRUCTIONS).toContain('最高可寫');
  });

  it('refuses when the snapshot changed, lost confirmation, or message vanished', () => {
    const p = makePlan();
    const changed = {
      ...inputs,
      jobSnapshot: snapshot({ confirmedAt: '2026-10-12T00:00:00.000Z' }),
    };
    expect(prepareDraft(p, changed, idSource('b'))).toEqual({
      ok: false,
      reason: 'snapshot_changed',
    });
    const unconfirmed = { ...inputs, jobSnapshot: snapshot({ confirmedAt: null }) };
    expect(prepareDraft(p, unconfirmed, idSource('b'))).toEqual({
      ok: false,
      reason: 'snapshot_not_confirmed',
    });
    expect(prepareDraft(p, { ...inputs, message: null }, idSource('b'))).toEqual({
      ok: false,
      reason: 'message_missing',
    });
  });

  it('refuses over budget', () => {
    const p = { ...makePlan(), budget: budget(10) };
    expect(prepareDraft(p, inputs, idSource('b'))).toEqual({ ok: false, reason: 'over_budget' });
  });

  it('boundary collisions are rejected', () => {
    expect(() =>
      buildDraftPrompt(
        { intent: 'accept', messageText: 'xyzBOUND', job: null, claims: [] },
        'xyzBOUND',
      ),
    ).toThrow();
  });
});
