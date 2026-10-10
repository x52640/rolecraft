// P1-T003 對抗驗證找到的缺陷回歸測試：重複區塊、片段首尾空白。
import { Claim, SourceExcerpt, type SourceDocument } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { normalizeExcerpt } from './blocks.ts';
import { checkExcerpt, evaluateClaimSources, isUsableForGeneration } from './evaluate.ts';
import { createSourceExcerpt, locateExcerpt, parseLocation } from './location.ts';

const doc = (version: number): SourceDocument => ({
  id: 'd1',
  folderPath: '/p',
  documentPath: '/p/d1.md',
  contentHash: `h${String(version)}`,
  contentVersion: version,
  authorizationStatus: 'authorized',
  importedAt: '2026-10-10T00:00:00+08:00',
});

const present = (text: string, version = 2) =>
  ({ kind: 'present', document: doc(version), text }) as const;

function excerptOf(text: string, piece: string, occurrence?: number): SourceExcerpt {
  const res = createSourceExcerpt(doc(1), text, piece, occurrence);
  if (!res.ok) throw new Error(`locate failed: ${res.reason}`);
  return SourceExcerpt.parse(res.excerpt);
}

const outcome = (excerpt: SourceExcerpt, text: string, version = 2) =>
  checkExcerpt(excerpt, present(text, version)).outcome;

const claimWith = (excerpt: SourceExcerpt) =>
  Claim.parse({
    id: 'c1',
    type: 'feature',
    text: '登入',
    completionStatus: 'user_confirmed_done',
    basis: {
      sourceExcerpts: [excerpt],
      userConfirmation: { confirmedAt: '2026-10-10T00:00:00+08:00', text: '登入完成' },
    },
    reviewStatus: 'normal',
  });

describe('重複區塊（同標題路徑、同原文的多份）', () => {
  const DUP = '# 週報\n\n登入功能：完成\n\n登入功能：完成\n';

  it('位置記下第幾份與共幾份', () => {
    const first = excerptOf(DUP, '登入功能：完成', 0);
    const second = excerptOf(DUP, '登入功能：完成', 1);
    expect(parseLocation(first.location)).toMatchObject({ startBlock: 1, ordinal: 0, count: 2 });
    expect(parseLocation(second.location)).toMatchObject({ startBlock: 2, ordinal: 1, count: 2 });
    // 未指定時兩處指紋相同，不算歧義，取第一份
    const res = locateExcerpt(DUP, '登入功能：完成');
    expect(res.ok && res.location.ordinal).toBe(0);
  });

  it('同版本、沒變 → 沒變', () => {
    for (const occ of [0, 1, undefined]) {
      expect(outcome(excerptOf(DUP, '登入功能：完成', occ), DUP, 1)).toBe('unchanged');
    }
  });

  it('PoC：被引用那份加上撤回說明 → 待複核、不可用於生成', () => {
    const ex = excerptOf(DUP, '登入功能：完成');
    const v2 = '# 週報\n\n登入功能：完成\n（更正：先前記載有誤，已撤回）\n\n登入功能：完成\n';
    expect(outcome(ex, v2)).toBe('block_changed');
    const claim = claimWith(ex);
    const res = evaluateClaimSources(claim, new Map([['d1', present(v2)]]));
    expect(res.reviewStatus).toBe('needs_review');
    expect(isUsableForGeneration({ ...claim, reviewStatus: res.reviewStatus })).toBe(false);
  });

  it('被引用那份改字或整段刪除 → 待複核', () => {
    const second = excerptOf(DUP, '登入功能：完成', 1);
    expect(outcome(second, '# 週報\n\n登入功能：完成\n\n登入功能：完成（已撤回）\n')).toBe(
      'block_changed',
    );
    expect(outcome(second, '# 週報\n\n登入功能：完成\n')).toBe('block_changed');
    const first = excerptOf(DUP, '登入功能：完成', 0);
    expect(outcome(first, '# 週報\n\n登入功能：完成\n')).toBe('block_changed');
  });

  it('多一份相同區塊、或重複區塊整體換位置 → 待複核（無法證明是同一份）', () => {
    const ex = excerptOf(DUP, '登入功能：完成', 1);
    expect(outcome(ex, `${DUP}\n登入功能：完成\n`)).toBe('block_changed');
    expect(outcome(ex, '# 週報\n\n前言\n\n登入功能：完成\n\n登入功能：完成\n')).toBe(
      'block_changed',
    );
  });

  it('重複區塊之外的部分改動 → 沒變', () => {
    const ex = excerptOf(DUP, '登入功能：完成', 1);
    expect(outcome(ex, `${DUP}\n其他說明\n`)).toBe('unchanged');
  });

  it('不同章節下的同字串不算重複（標題路徑不同），只有一份時重排仍算沒變', () => {
    const v1 = '## A\n\n登入功能：完成\n\n## B\n\n登入功能：完成\n';
    const ex = excerptOf(v1, '登入功能：完成', 1);
    expect(parseLocation(ex.location)).toMatchObject({ ordinal: 0, count: 1 });
    expect(outcome(ex, '## B\n\n登入功能：完成\n\n## A\n\n登入功能：已撤回\n')).toBe('unchanged');
  });

  it('舊格式 tb1：新文件中同一序列超過一份 → 待複核；只有一份 → 照舊比對', () => {
    const fp = parseLocation(excerptOf(DUP, '登入功能：完成').location)?.fingerprints[0] ?? '';
    const legacy = { ...excerptOf(DUP, '登入功能：完成'), location: `tb1:1:${fp}` };
    expect(outcome(legacy, DUP, 1)).toBe('block_changed');
    expect(outcome(legacy, '# 週報\n\n其他\n\n登入功能：完成\n')).toBe('unchanged');
  });
});

describe('片段首尾空白與換行', () => {
  const V = '# A\n\n完成登入\n\n其他\n';

  it('PoC：尾端換行的片段，同版本檢查 → 沒變', () => {
    const ex = excerptOf(V, '完成登入\n');
    expect(ex.text).toBe('完成登入');
    expect(outcome(ex, V, 1)).toBe('unchanged');
  });

  it('首尾的換行、空白、全形空白、零寬字元都去掉，建立與檢查一致', () => {
    for (const piece of ['\n完成登入', '完成登入\n\n', ' 　完成登入​', '\r\n完成登入\r\n']) {
      const ex = excerptOf(V, piece);
      expect(ex.text).toBe('完成登入');
      expect(outcome(ex, V, 1)).toBe('unchanged');
    }
  });

  it('跨區塊片段帶首尾換行也一致', () => {
    const ex = excerptOf(V, '\n完成登入\n\n其他\n');
    expect(parseLocation(ex.location)?.fingerprints).toHaveLength(2);
    expect(outcome(ex, V, 1)).toBe('unchanged');
  });

  it('舊資料原文帶尾換行，檢查時同樣去掉後比對', () => {
    const ex = { ...excerptOf(V, '完成登入'), text: '完成登入\n' };
    expect(outcome(ex, V, 1)).toBe('unchanged');
  });

  it('只有空白類字元 → 空片段', () => {
    expect(normalizeExcerpt('\n 　​\n')).toBe('');
    expect(createSourceExcerpt(doc(1), V, '\n\n')).toMatchObject({ reason: 'empty_excerpt' });
  });
});
