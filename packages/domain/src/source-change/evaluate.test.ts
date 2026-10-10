import { Claim, SourceExcerpt, type SourceDocument } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { applyConflictMarks, type SourceConflictMark } from './conflict.ts';
import {
  checkExcerpt,
  evaluateClaimSources,
  isUsableForGeneration,
  type SourceState,
} from './evaluate.ts';
import { createSourceExcerpt } from './location.ts';

const doc = (id: string, version: number, extra: Partial<SourceDocument> = {}): SourceDocument => ({
  id,
  folderPath: '/p',
  documentPath: `/p/${id}.md`,
  contentHash: `h${String(version)}`,
  contentVersion: version,
  authorizationStatus: 'authorized',
  importedAt: '2026-10-10T00:00:00+08:00',
  ...extra,
});

const V1 = [
  '# 專案 A',
  '',
  '## 功能',
  '',
  '完成匯出 PDF 功能。',
  '支援中文字型。',
  '',
  '其他說明。',
].join('\n');

function excerptOf(text: string, piece: string, id = 'd1', occurrence?: number): SourceExcerpt {
  const res = createSourceExcerpt(doc(id, 1), text, piece, occurrence);
  if (!res.ok) throw new Error(`locate failed: ${res.reason}`);
  return SourceExcerpt.parse(res.excerpt);
}

const present = (text: string, version = 2, id = 'd1', extra: Partial<SourceDocument> = {}) =>
  ({ kind: 'present', document: doc(id, version, extra), text }) as const;

const outcome = (excerpt: SourceExcerpt, state: SourceState) =>
  checkExcerpt(excerpt, state).outcome;

function claimWith(excerpts: SourceExcerpt[], confirmed = false): Claim {
  return Claim.parse({
    id: 'c1',
    type: 'feature',
    text: '匯出 PDF',
    completionStatus: confirmed ? 'user_confirmed_done' : 'documented_done',
    basis: {
      sourceExcerpts: excerpts,
      userConfirmation: confirmed
        ? { confirmedAt: '2026-10-10T00:00:00+08:00', text: '匯出 PDF 已完成' }
        : null,
    },
    reviewStatus: 'normal',
  });
}

const sources = (...entries: [string, SourceState][]) => new Map(entries);

describe('S9-15 來源變更四種情境', () => {
  const ex = excerptOf(V1, '完成匯出 PDF 功能。');

  it('1. 引用片段被改掉 → 待複核', () => {
    const v2 = V1.replace('完成匯出 PDF 功能。', '規劃匯出 PDF 功能。');
    const res = evaluateClaimSources(claimWith([ex]), sources(['d1', present(v2)]));
    expect(res.checks[0]?.outcome).toBe('excerpt_missing');
    expect(res.reviewStatus).toBe('needs_review');
  });

  it('2. 片段仍在但所在區塊加了更正說明 → 待複核（已確認的也一樣）', () => {
    const v2 = V1.replace('支援中文字型。', '支援中文字型。\n（更正：先前記載有誤，尚未完成）');
    const res = evaluateClaimSources(claimWith([ex], true), sources(['d1', present(v2)]));
    expect(res.checks[0]?.outcome).toBe('block_changed');
    expect(res.reviewStatus).toBe('needs_review');
    expect(
      isUsableForGeneration({ ...claimWith([ex], true), reviewStatus: res.reviewStatus }),
    ).toBe(false);
  });

  it('3. 來源檔被刪除或撤銷授權 → 來源已移除；未確認的不可用、已確認的可保留', () => {
    for (const state of [
      { kind: 'deleted' } as const,
      present(V1, 1, 'd1', { authorizationStatus: 'revoked' }),
    ]) {
      const unconfirmed = evaluateClaimSources(claimWith([ex]), sources(['d1', state]));
      expect(unconfirmed.reviewStatus).toBe('source_removed');
      expect(isUsableForGeneration({ ...claimWith([ex]), reviewStatus: 'source_removed' })).toBe(
        false,
      );
      const confirmed = evaluateClaimSources(claimWith([ex], true), sources(['d1', state]));
      expect(confirmed.reviewStatus).toBe('source_removed');
      expect(
        isUsableForGeneration({ ...claimWith([ex], true), reviewStatus: 'source_removed' }),
      ).toBe(true);
    }
  });

  it('4. 跨文件或同文件矛盾 → 來源矛盾，不可用於生成', () => {
    const other = excerptOf('功能清單：匯出 PDF（計畫中）', '匯出 PDF（計畫中）', 'd2');
    const cross: SourceConflictMark = {
      scope: 'cross_document',
      claimIds: ['c1'],
      excerpts: [ex, other],
      summary: 'd1 寫完成，d2 寫計畫中',
    };
    const [marked] = applyConflictMarks([claimWith([ex], true)], [cross]);
    expect(marked?.reviewStatus).toBe('source_conflict');
    expect(marked && isUsableForGeneration(marked)).toBe(false);

    const doc2 = `${V1}\n\n## 更新\n\n匯出 PDF 已撤下。`;
    const later = excerptOf(doc2, '匯出 PDF 已撤下。');
    const same: SourceConflictMark = {
      scope: 'same_document',
      claimIds: ['c1'],
      excerpts: [ex, later],
      summary: '同文件前寫完成、後寫撤下',
    };
    expect(applyConflictMarks([claimWith([ex])], [same])[0]?.reviewStatus).toBe('source_conflict');
  });

  it('待複核與矛盾的事實項不用於新的生成', () => {
    const base = claimWith([ex]);
    expect(isUsableForGeneration({ ...base, reviewStatus: 'normal' })).toBe(true);
    expect(isUsableForGeneration({ ...base, reviewStatus: 'needs_review' })).toBe(false);
    expect(isUsableForGeneration({ ...base, reviewStatus: 'source_conflict' })).toBe(false);
  });
});

describe('區塊判定邊界', () => {
  const ex = excerptOf(V1, '完成匯出 PDF 功能。');

  it('區塊完全沒變 → 保留原狀態，但其他部分有變要重新分析', () => {
    const v2 = V1.replace('其他說明。', '其他說明（改寫）。');
    const res = evaluateClaimSources(claimWith([ex]), sources(['d1', present(v2)]));
    expect(res.reviewStatus).toBe('normal');
    expect(res.documentsToReanalyze).toEqual(['d1']);
    expect(res.checks[0]?.rebased?.contentVersion).toBe(2);
  });

  it('同版本同內容 → 不需重新分析', () => {
    const res = evaluateClaimSources(claimWith([ex]), sources(['d1', present(V1, 1)]));
    expect(res.reviewStatus).toBe('normal');
    expect(res.documentsToReanalyze).toEqual([]);
  });

  it('更正放在空行之後的新區塊 → 區塊沒變，但標示整份文件重新分析', () => {
    const v2 = V1.replace('支援中文字型。', '支援中文字型。\n\n更正：上段有誤。');
    const res = evaluateClaimSources(claimWith([ex]), sources(['d1', present(v2)]));
    expect(res.reviewStatus).toBe('normal');
    expect(res.documentsToReanalyze).toEqual(['d1']);
  });

  it('刪掉分隔空行讓更正併入同一區塊 → 待複核', () => {
    const v2 = V1.replace('支援中文字型。\n\n其他說明。', '支援中文字型。\n其他說明：以上有誤。');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });

  it('用全形空白行「假裝」分隔不會讓更正逃出區塊（有文字的行不算空行）', () => {
    const v2 = V1.replace('支援中文字型。', '支援中文字型。\n\u3000更正：未完成');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });

  it('只把換行改成 CRLF → 沒變', () => {
    expect(outcome(ex, present(V1.replace(/\n/g, '\r\n')))).toBe('unchanged');
  });

  it('區塊內行尾多一個空白 → 有變', () => {
    expect(outcome(ex, present(V1.replace('支援中文字型。', '支援中文字型。 ')))).toBe(
      'block_changed',
    );
  });

  it('所屬章節標題被改 → 待複核', () => {
    expect(outcome(ex, present(V1.replace('## 功能', '## 已撤下功能')))).toBe('block_changed');
  });

  it('區塊被搬到別的章節 → 待複核', () => {
    const v2 = [
      '# 專案 A',
      '',
      '## 功能',
      '',
      '其他說明。',
      '',
      '## 已取消',
      '',
      '完成匯出 PDF 功能。\n支援中文字型。',
    ].join('\n');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });

  it('文件整個重排但區塊與章節不變 → 沒變（並要求重新分析）', () => {
    const v2 = [
      '# 專案 A',
      '',
      '## 功能',
      '',
      '其他說明。',
      '',
      '完成匯出 PDF 功能。\n支援中文字型。',
    ].join('\n');
    const res = evaluateClaimSources(claimWith([ex]), sources(['d1', present(v2)]));
    expect(res.reviewStatus).toBe('normal');
    expect(res.documentsToReanalyze).toEqual(['d1']);
    expect(res.checks[0]?.rebased?.location).not.toBe(ex.location);
  });

  it('文件整個重排並改寫 → 待複核', () => {
    const v2 = ['## 功能', '完成匯出 PDF 功能。', '支援中文字型。', '# 專案 A'].join('\n');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });
});

describe('片段跨區塊與多次出現', () => {
  const doc1 = ['完成登入。', '', '完成匯出。', '', '## 計畫', '', '完成匯出。（尚未開始）'].join(
    '\n',
  );

  it('片段跨區塊：兩個區塊都沒變 → 沒變；任一變更 → 待複核', () => {
    const ex = excerptOf(doc1, '完成登入。\n\n完成匯出。');
    expect(outcome(ex, present(doc1))).toBe('unchanged');
    expect(outcome(ex, present(doc1.replace('完成匯出。\n\n##', '完成匯出。更正\n\n##')))).toBe(
      'block_changed',
    );
    expect(outcome(ex, present(`${doc1.replace('完成匯出。\n', '完成匯出。\n補充\n')}`))).toBe(
      'block_changed',
    );
  });

  it('跨區塊片段中間的空行數改變 → 片段消失', () => {
    const ex = excerptOf(doc1, '完成登入。\n\n完成匯出。');
    expect(outcome(ex, present(doc1.replace('完成登入。\n\n', '完成登入。\n\n\n')))).toBe(
      'excerpt_missing',
    );
  });

  it('跨區塊的兩塊中間插入新區塊 → 片段消失（待複核）', () => {
    const v3 = ['完成登入。', '', '中間', '', '完成匯出。'].join('\n');
    const ex3 = excerptOf(['完成登入。', '', '完成匯出。'].join('\n'), '完成登入。\n\n完成匯出。');
    expect(outcome(ex3, present(v3))).toBe('excerpt_missing');
  });

  it('片段出現多次：引用的那一處被改、另一處仍在 → 待複核', () => {
    const ex = excerptOf(doc1, '完成匯出。', 'd1', 0);
    const v2 = doc1.replace('完成登入。\n\n完成匯出。', '完成登入。\n\n完成匯出。更正：未上線');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });

  it('片段出現多次：引用的那一處沒變 → 沒變', () => {
    const ex = excerptOf(doc1, '完成匯出。', 'd1', 1);
    expect(outcome(ex, present(doc1.replace('完成登入。', '完成登入！')))).toBe('unchanged');
    const ex2 = excerptOf(doc1, '完成匯出。', 'd1', 0);
    expect(outcome(ex2, present(doc1.replace('（尚未開始）', '（已取消）')))).toBe('unchanged');
  });

  it('引用的區塊整段被刪、同字串只剩在別處 → 待複核', () => {
    const ex = excerptOf(doc1, '完成匯出。', 'd1', 0);
    const v2 = doc1.replace('完成匯出。\n\n## 計畫', '## 計畫');
    expect(outcome(ex, present(v2))).toBe('block_changed');
  });
});

describe('防呆', () => {
  const ex = excerptOf(V1, '完成匯出 PDF 功能。');

  it('位置格式無法解析 → 無法驗證 → 待複核', () => {
    const bad = { ...ex, location: 'L10-L12' };
    const res = evaluateClaimSources(claimWith([bad]), sources(['d1', present(V1, 1)]));
    expect(res.checks[0]?.outcome).toBe('unverifiable');
    expect(res.reviewStatus).toBe('needs_review');
  });

  it('同版本但雜湊不同、或版本倒退 → 無法驗證', () => {
    expect(outcome(ex, present(V1, 1, 'd1', { contentHash: 'other' }))).toBe('unverifiable');
    expect(outcome({ ...ex, contentVersion: 3 }, present(V1, 2))).toBe('unverifiable');
  });

  it('授權待確認視同來源已移除', () => {
    expect(outcome(ex, present(V1, 1, 'd1', { authorizationStatus: 'pending' }))).toBe(
      'source_removed',
    );
  });

  it('缺少來源現況要丟錯，不能默默當成已移除', () => {
    expect(() => evaluateClaimSources(claimWith([ex]), new Map())).toThrow(/缺少來源文件現況/);
  });

  it('狀態只升不降：待複核與矛盾不會被沒變的結果解除', () => {
    for (const prev of ['needs_review', 'source_conflict'] as const) {
      const claim = { ...claimWith([ex]), reviewStatus: prev };
      expect(evaluateClaimSources(claim, sources(['d1', present(V1, 1)])).reviewStatus).toBe(prev);
    }
  });

  it('多來源：一個被刪、一個沒變 → 正常；一個被刪、一個變更 → 待複核', () => {
    const ex2 = excerptOf('匯出 PDF 完成', '匯出 PDF 完成', 'd2');
    const claim = claimWith([ex, ex2]);
    const deleted = { kind: 'deleted' } as const;
    expect(
      evaluateClaimSources(claim, sources(['d1', present(V1, 1)], ['d2', deleted])).reviewStatus,
    ).toBe('normal');
    expect(
      evaluateClaimSources(
        claim,
        sources(['d1', present(V1.replace('支援中文字型。', '支援中文字型！'))], ['d2', deleted]),
      ).reviewStatus,
    ).toBe('needs_review');
  });

  it('矛盾標記不合法或指向不存在的事實項 → 丟錯', () => {
    const ex2 = excerptOf('x 計畫中', 'x 計畫中', 'd2');
    const base: SourceConflictMark = {
      scope: 'cross_document',
      claimIds: ['c1'],
      excerpts: [ex, ex2],
      summary: 's',
    };
    const claims = [claimWith([ex])];
    expect(() => applyConflictMarks(claims, [{ ...base, claimIds: ['nope'] }])).toThrow();
    expect(() => applyConflictMarks(claims, [{ ...base, excerpts: [ex] }])).toThrow();
    expect(() => applyConflictMarks(claims, [{ ...base, scope: 'same_document' }])).toThrow();
    expect(() => applyConflictMarks(claims, [{ ...base, excerpts: [ex, ex] }])).toThrow();
  });
});

describe('P1-T035 回歸：沒有依據的事實項', () => {
  it('reviewStatus 正常但沒有來源片段也沒有使用者確認 → 不可用於生成', () => {
    expect(isUsableForGeneration(claimWith([]))).toBe(false);
  });

  it('只有使用者確認、沒有來源片段 → 可用', () => {
    expect(isUsableForGeneration(claimWith([], true))).toBe(true);
  });
});
