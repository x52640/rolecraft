import { CanonicalId, CanonicalTimestamp, Sha256Hash, Timestamp } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { newId, nowTimestamp, sha256Hex } from './ids.ts';

describe('generated formats (ADR-0006 item 1)', () => {
  it('newId is a lowercase UUID v4', () => {
    const id = newId();
    expect(CanonicalId.safeParse(id).success).toBe(true);
    expect(newId()).not.toBe(id);
    expect(CanonicalId.safeParse(id.toUpperCase()).success).toBe(false);
  });

  it('nowTimestamp is UTC with milliseconds and also passes the read schema', () => {
    const ts = nowTimestamp(new Date('2026-10-10T08:00:00+08:00'));
    expect(ts).toBe('2026-10-10T00:00:00.000Z');
    expect(CanonicalTimestamp.safeParse(ts).success).toBe(true);
    expect(Timestamp.safeParse(ts).success).toBe(true);
    expect(CanonicalTimestamp.safeParse('2026-10-10T08:00:00+08:00').success).toBe(false);
  });

  it('sha256Hex is 64 lowercase hex chars', () => {
    const hash = sha256Hex('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(Sha256Hash.safeParse(hash).success).toBe(true);
  });
});
