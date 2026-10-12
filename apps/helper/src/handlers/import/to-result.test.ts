import { ImportResult } from '@rolecraft/contracts';
import type { DraftField, ExtractSuccess } from '@rolecraft/resume-import';
import { describe, expect, it } from 'vitest';

import { toImportResult } from './to-result.ts';

const f = (value: string, lineIndex: number): DraftField => ({
  value,
  status: 'unconfirmed',
  source: { pageNumber: 1, lineIndex },
});

function extracted(structured?: ExtractSuccess['draft']['structured']): ExtractSuccess {
  return {
    ok: true,
    pageCount: 1,
    pages: [{ pageNumber: 1, width: 595, height: 842, columns: 1, lines: [] }],
    pagesWithoutText: [],
    draft: {
      name: null,
      dates: [],
      companies: [],
      titles: [],
      experiences: [],
      skills: [],
      ...(structured ? { structured } : {}),
    },
  };
}

describe('toImportResult 結構化草稿（P1-T066）', () => {
  it('104 結構化草稿原樣帶出欄位與出處，符合 contracts', () => {
    const result = toImportResult(
      'r.pdf',
      extracted({
        layout: '104',
        personalInfo: [{ label: '姓名', value: f('林測試', 0) }],
        experiences: [
          {
            company: f('範例科技有限公司', 3),
            title: f('產品經理', 2),
            startDate: f('2021/1', 4),
            endDate: null,
            current: true,
            description: null,
          },
        ],
        skills: [f('SQL', 9)],
      }),
    );
    expect(ImportResult.safeParse(result).success).toBe(true);
    if (result.status !== 'parsed') throw new Error('expected parsed');
    expect(result.draft.structured).toEqual({
      layout: '104',
      personalInfo: [{ label: '姓名', value: { value: '林測試', pageNumber: 1, lineIndex: 0 } }],
      experiences: [
        {
          company: { value: '範例科技有限公司', pageNumber: 1, lineIndex: 3 },
          title: { value: '產品經理', pageNumber: 1, lineIndex: 2 },
          startDate: { value: '2021/1', pageNumber: 1, lineIndex: 4 },
          endDate: null,
          current: true,
          description: null,
        },
      ],
      skills: [{ value: 'SQL', pageNumber: 1, lineIndex: 9 }],
    });
  });

  it('認不出版面時不帶 structured（舊回應形狀不變）', () => {
    const result = toImportResult('r.pdf', extracted());
    if (result.status !== 'parsed') throw new Error('expected parsed');
    expect('structured' in result.draft).toBe(false);
  });
});
