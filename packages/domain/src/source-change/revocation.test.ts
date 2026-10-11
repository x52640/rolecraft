/** 擁有者裁定 #15：撤銷後重新授權、內容指紋相同 → 恢復撤銷前狀態（evidence-model R2）。 */
import {
  Claim,
  SourceExcerpt,
  type AuthorizationStatus,
  type SourceDocument,
} from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { evaluateClaimSources, type SourceState } from './evaluate.ts';
import { createSourceExcerpt } from './location.ts';

const TEXT = ['# 專案 A', '', '完成匯出 PDF 功能。', '', '其他說明。'].join('\n');
const OTHER = ['# 專案 B', '', '完成登入功能。'].join('\n');

const doc = (
  id: string,
  authorizationStatus: AuthorizationStatus,
  version = 1,
  hash = `${id}-h${String(version)}`,
): SourceDocument => ({
  id,
  folderPath: '/p',
  documentPath: `/p/${id}.md`,
  contentHash: hash,
  contentVersion: version,
  authorizationStatus,
  importedAt: '2026-10-10T00:00:00+08:00',
});

const present = (
  id: string,
  auth: AuthorizationStatus,
  text: string,
  version = 1,
  hash?: string,
): SourceState => ({ kind: 'present', document: doc(id, auth, version, hash), text });

function excerptOf(id: string, text: string, piece: string): SourceExcerpt {
  const res = createSourceExcerpt(doc(id, 'authorized'), text, piece);
  if (!res.ok) throw new Error(res.reason);
  return SourceExcerpt.parse(res.excerpt);
}

const EX1 = excerptOf('d1', TEXT, '完成匯出 PDF 功能。');
const EX2 = excerptOf('d2', OTHER, '完成登入功能。');

function claimWith(excerpts: SourceExcerpt[], extra: Partial<Claim> = {}): Claim {
  return Claim.parse({
    id: 'c1',
    type: 'feature',
    text: '匯出 PDF',
    completionStatus: 'documented_done',
    basis: { sourceExcerpts: excerpts, userConfirmation: null },
    reviewStatus: 'normal',
    ...extra,
  });
}

const sources = (...entries: [string, SourceState][]) => new Map(entries);

/** 把判定結果套回事實項（與 pipeline planAnalysis 相同的套用方式）。 */
function apply(claim: Claim, map: ReadonlyMap<string, SourceState>): Claim {
  const res = evaluateClaimSources(claim, map);
  const next: Claim = { ...claim, reviewStatus: res.reviewStatus };
  delete next.revocationHold;
  if (res.revocationHold) next.revocationHold = res.revocationHold;
  return Claim.parse(next);
}

const revokedOnce = (claim: Claim) => apply(claim, sources(['d1', present('d1', 'revoked', TEXT)]));

describe('撤銷授權時保存恢復依據', () => {
  it('僅因撤銷而變來源已移除：保存撤銷前狀態、內容指紋與事實項內容', () => {
    const held = revokedOnce(claimWith([EX1]));
    expect(held.reviewStatus).toBe('source_removed');
    expect(held.revocationHold).toEqual({
      previousStatus: 'normal',
      sources: [{ sourceDocumentId: 'd1', contentHash: 'd1-h1' }],
      claimText: '匯出 PDF',
      completionStatus: 'documented_done',
    });
  });

  it('來源被刪除、待確認、使用者已確認、片段綁的不是撤銷當下版本 → 不保存', () => {
    const deleted = apply(claimWith([EX1]), sources(['d1', { kind: 'deleted' }]));
    const pending = apply(claimWith([EX1]), sources(['d1', present('d1', 'pending', TEXT)]));
    const confirmed = revokedOnce(
      claimWith([EX1], {
        basis: {
          sourceExcerpts: [EX1],
          userConfirmation: { confirmedAt: '2026-10-10T00:00:00+08:00', text: '匯出 PDF' },
        },
      }),
    );
    const newer = apply(claimWith([EX1]), sources(['d1', present('d1', 'revoked', TEXT, 2)]));
    for (const c of [deleted, pending, confirmed, newer]) {
      expect(c.reviewStatus).toBe('source_removed');
      expect(c.revocationHold).toBeUndefined();
    }
  });

  it('多來源一份撤銷、一份刪除 → 不保存', () => {
    const c = apply(
      claimWith([EX1, EX2]),
      sources(['d1', present('d1', 'revoked', TEXT)], ['d2', { kind: 'deleted' }]),
    );
    expect(c.reviewStatus).toBe('source_removed');
    expect(c.revocationHold).toBeUndefined();
  });
});

describe('重新授權後恢復', () => {
  it('內容指紋相同 → 恢復撤銷前狀態並清掉保存值', () => {
    const held = revokedOnce(claimWith([EX1]));
    const res = evaluateClaimSources(held, sources(['d1', present('d1', 'authorized', TEXT)]));
    expect(res.reviewStatus).toBe('normal');
    expect(res.revocationHold).toBeNull();
    expect(res.documentsToReanalyze).toEqual([]);
  });

  it('撤銷期間內容變了（指紋不同）→ 不恢復，保存值清掉，之後照 R2', () => {
    const held = revokedOnce(claimWith([EX1]));
    // 引用區塊沒變、只有其他部分變了：仍然不恢復
    const other = TEXT.replace('其他說明。', '其他說明（更新）。');
    const res = evaluateClaimSources(held, sources(['d1', present('d1', 'authorized', other, 2)]));
    expect(res.reviewStatus).toBe('source_removed');
    expect(res.revocationHold).toBeNull();
    // 同版本號但指紋不同（無法驗證）→ 待複核
    const sameVersion = evaluateClaimSources(
      held,
      sources(['d1', present('d1', 'authorized', TEXT, 1, 'd1-other')]),
    );
    expect(sameVersion.reviewStatus).toBe('needs_review');
    expect(sameVersion.revocationHold).toBeNull();
  });

  it('多來源：另一份仍撤銷 → 不恢復、保存值保留；兩份都重新授權才恢復', () => {
    const both = sources(
      ['d1', present('d1', 'revoked', TEXT)],
      ['d2', present('d2', 'revoked', OTHER)],
    );
    const held = apply(claimWith([EX1, EX2]), both);
    expect(held.revocationHold?.sources).toHaveLength(2);

    const half = sources(
      ['d1', present('d1', 'authorized', TEXT)],
      ['d2', present('d2', 'revoked', OTHER)],
    );
    const still = apply(held, half);
    expect(still.reviewStatus).toBe('source_removed');
    expect(still.revocationHold).toEqual(held.revocationHold);

    const all = sources(
      ['d1', present('d1', 'authorized', TEXT)],
      ['d2', present('d2', 'authorized', OTHER)],
    );
    const restored = apply(still, all);
    expect(restored.reviewStatus).toBe('normal');
    expect(restored.revocationHold).toBeUndefined();
  });

  it('多來源：另一份重新授權但內容變了 → 不恢復、保存值清掉', () => {
    const both = sources(
      ['d1', present('d1', 'revoked', TEXT)],
      ['d2', present('d2', 'revoked', OTHER)],
    );
    const held = apply(claimWith([EX1, EX2]), both);
    const changed = OTHER.replace('完成登入功能。', '規劃登入功能。');
    const res = evaluateClaimSources(
      held,
      sources(
        ['d1', present('d1', 'authorized', TEXT)],
        ['d2', present('d2', 'authorized', changed, 2)],
      ),
    );
    expect(res.reviewStatus).toBe('needs_review');
    expect(res.revocationHold).toBeNull();
  });

  it('舊資料（來源已移除但沒有保存值）→ 一律不恢復', () => {
    const legacy = claimWith([EX1], { reviewStatus: 'source_removed' });
    const res = evaluateClaimSources(legacy, sources(['d1', present('d1', 'authorized', TEXT)]));
    expect(res.reviewStatus).toBe('source_removed');
    expect(res.revocationHold).toBeNull();
  });

  it('保存後事實項內容被改過、或被使用者確認 → 不恢復、保存值清掉', () => {
    const held = revokedOnce(claimWith([EX1]));
    const back = sources(['d1', present('d1', 'authorized', TEXT)]);
    const edited = { ...held, text: '匯出 PDF 與 Word', completionStatus: 'unknown' as const };
    const confirmed: Claim = {
      ...held,
      basis: {
        ...held.basis,
        userConfirmation: { confirmedAt: '2026-10-11T00:00:00+08:00', text: '匯出 PDF' },
      },
    };
    for (const c of [edited, confirmed]) {
      const res = evaluateClaimSources(c, back);
      expect(res.reviewStatus).toBe('source_removed');
      expect(res.revocationHold).toBeNull();
    }
  });

  it('撤銷期間來源被刪除或變待確認 → 保存值清掉；之後重新出現也不恢復', () => {
    const held = revokedOnce(claimWith([EX1]));
    for (const state of [{ kind: 'deleted' } as const, present('d1', 'pending', TEXT)]) {
      const dropped = apply(held, sources(['d1', state]));
      expect(dropped.reviewStatus).toBe('source_removed');
      expect(dropped.revocationHold).toBeUndefined();
      const later = apply(dropped, sources(['d1', present('d1', 'authorized', TEXT)]));
      expect(later.reviewStatus).toBe('source_removed');
    }
  });

  it('狀態已不是來源已移除（例如被標來源矛盾）→ 保存值不起作用', () => {
    const held = revokedOnce(claimWith([EX1]));
    const conflict = { ...held, reviewStatus: 'source_conflict' as const };
    const res = evaluateClaimSources(conflict, sources(['d1', present('d1', 'authorized', TEXT)]));
    expect(res.reviewStatus).toBe('source_conflict');
    expect(res.revocationHold).toBeNull();
  });
});
