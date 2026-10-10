import type { SourceDocument } from '@rolecraft/contracts';
import type { InputBudget } from '@rolecraft/domain';

import type { AnalysisDocument, ClaimDraft } from './types.ts';

export const T = '2026-10-10T08:00:00.000Z';

export function doc(
  id: string,
  text: string,
  overrides: Partial<SourceDocument> = {},
): AnalysisDocument {
  return {
    document: {
      id,
      folderPath: '/Users/someone/project',
      documentPath: `${id}.md`,
      contentHash: `hash-${id}-1`,
      contentVersion: 1,
      authorizationStatus: 'authorized',
      importedAt: T,
      ...overrides,
    },
    text,
  };
}

export function budget(available: number): InputBudget {
  return { contextLimit: available, outputReserve: 0, toolOverheadReserve: 0, available };
}

/** 依序產生 UUID 形狀的 ID（界線標記也用它）。 */
export function idSource(prefix = 'a'): () => string {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, '0');
    return `${prefix.repeat(8)}-0000-4000-8000-${hex}`;
  };
}

export function draft(overrides: Partial<ClaimDraft> = {}): ClaimDraft {
  return {
    segment: 'S1',
    type: 'feature',
    text: '登入功能',
    completionStatus: 'documented_done',
    excerpt: '完成登入功能',
    ...overrides,
  };
}

/** 模型輸出 JSON。 */
export function modelOutput(
  claims: readonly object[],
  summary = '摘要',
  conflicts: readonly object[] = [],
): string {
  return JSON.stringify({ claims, conflicts, summary });
}
