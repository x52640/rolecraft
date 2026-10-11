import { describe, expect, it } from 'vitest';

import { claim } from './__fixtures__/claims-db.ts';
import { withEditedText } from './storage-service.ts';

describe('修改內容與撤銷保存值（擁有者裁定 #15）', () => {
  const held = claim('c1', {
    reviewStatus: 'source_removed',
    revocationHold: {
      previousStatus: 'normal',
      sources: [{ sourceDocumentId: 'doc-1', contentHash: 'a'.repeat(64) }],
      claimText: '支援 PDF 匯出',
      completionStatus: 'documented_done',
    },
  });

  it('改內容就清掉保存值，維持來源已移除', () => {
    const edited = withEditedText(held, '支援 PDF 與 Word 匯出');
    expect(edited.reviewStatus).toBe('source_removed');
    expect(edited.revocationHold).toBeUndefined();
  });

  it('改了又改回原文也不能恢復', () => {
    const reverted = withEditedText(withEditedText(held, '支援 Word 匯出'), '支援 PDF 匯出');
    expect(reverted.text).toBe(held.text);
    expect(reverted.revocationHold).toBeUndefined();
  });
});
