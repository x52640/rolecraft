import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_SUMMARY_MAX_CHARS,
  GLOBAL_SUMMARY_MAX_CHARS,
  mergeDocumentSummaries,
  renderGlobalSummary,
} from './summary.ts';
import type { UnitAnalysisResult } from './types.ts';

function result(id: string, summary: string): UnitAnalysisResult {
  return {
    unitId: `u-${id}-${summary}`,
    sourceDocumentId: id,
    contentVersion: 1,
    contentHash: 'h',
    claims: [],
    conflicts: [],
    summary,
    dropped: [],
  };
}

describe('global resume summary（F05）', () => {
  it('replaces re-analyzed documents and drops inactive ones', () => {
    const previous = [
      { sourceDocumentId: 'a', label: 'a.md', text: '舊 A' },
      { sourceDocumentId: 'b', label: 'b.md', text: '舊 B' },
      { sourceDocumentId: 'gone', label: 'gone.md', text: '已撤銷' },
    ];
    const merged = mergeDocumentSummaries(
      previous,
      [result('a', '新 A1'), result('a', '新 A2'), result('c', '新 C')],
      new Map([['c', 'c.md']]),
      new Set(['a', 'b', 'c']),
    );
    expect(merged).toEqual([
      { sourceDocumentId: 'a', label: 'a.md', text: '新 A1\n新 A2' },
      { sourceDocumentId: 'b', label: 'b.md', text: '舊 B' },
      { sourceDocumentId: 'c', label: 'c.md', text: '新 C' },
    ]);
    expect(renderGlobalSummary(merged)).toBe('【a.md】新 A1\n新 A2\n【b.md】舊 B\n【c.md】新 C');
  });

  it('caps per-document and global length', () => {
    const merged = mergeDocumentSummaries(
      [],
      [result('a', 'x'.repeat(DOCUMENT_SUMMARY_MAX_CHARS * 2))],
      new Map([['a', 'a.md']]),
      new Set(['a']),
    );
    expect(merged[0]?.text.length).toBe(DOCUMENT_SUMMARY_MAX_CHARS);
    const many = Array.from({ length: 20 }, (_, i) => ({
      sourceDocumentId: String(i),
      label: `${String(i)}.md`,
      text: 'y'.repeat(DOCUMENT_SUMMARY_MAX_CHARS),
    }));
    expect(renderGlobalSummary(many).length).toBe(GLOBAL_SUMMARY_MAX_CHARS);
  });
});
