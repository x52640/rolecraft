import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import { readInterviewInput } from './interview-input.ts';
import { deleteMaterial } from './material-deletion.ts';

let t: ReturnType<typeof exportTestbed>;

beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

describe('S9-12 interview input stays as applied', () => {
  it('after editing resume, job snapshot, claim and deleting the source', () => {
    const pdf = t.pdf('投遞版');
    const applied = t.exports.create(t.exportInput(), pdf);
    const record = t.apply(applied);
    const atApplication = structuredClone(readInterviewInput(t.db, t.files, record.id));
    expect(atApplication.exportVersion).toEqual(applied);
    expect(atApplication.pdf).toEqual(pdf);
    expect(atApplication.deletedMaterials).toEqual([]);

    // 投遞後：改履歷、改職缺快照、改事實項，並再匯出一版
    const rv = t.repos.resumeVersions.get(t.resume.id);
    const job = t.repos.jobSnapshots.get(t.job.id);
    const fact = t.repos.claims.get(t.fact.id);
    if (!rv || !job || !fact) throw new Error('fixture missing');
    t.repos.resumeVersions.save({
      ...rv,
      sections: rv.sections.map((s) => ({ ...s, text: '改寫後的段落' })),
    });
    t.repos.jobSnapshots.save({
      ...job,
      userModified: true,
      fields: { ...job.fields, title: '資深前端工程師' },
    });
    t.repos.claims.save({ ...fact, text: '改過的事實項' });
    const later = t.exportNow('修改後');
    expect(later.sections[0]?.text).toBe('改寫後的段落');

    // 刪來源文件與事實項：已投遞版本保留，未投遞的新版本整份刪除
    const bySource = deleteMaterial(t.db, t.files, { kind: 'source_document', id: t.source.id });
    expect(bySource.retainedExportVersionIds).toEqual([applied.id]);
    expect(bySource.deletedExportVersionIds).toEqual([later.id]);
    const byClaim = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(byClaim.retainedExportVersionIds).toEqual([applied.id]);

    const now = readInterviewInput(t.db, t.files, record.id);
    expect(now.applicationRecord).toEqual(atApplication.applicationRecord);
    expect(now.exportVersion).toEqual(atApplication.exportVersion);
    expect(now.pdf).toEqual(atApplication.pdf);
    expect(now.exportVersion.sections[0]?.text).toBe('完成 PDF 匯出功能');
    expect(now.exportVersion.jobSnapshot.fields.title).toBe('前端工程師');
    expect(now.exportVersion.citedClaims[0]).toEqual({
      claimId: t.fact.id,
      claimText: '支援 PDF 匯出',
      excerptTexts: ['已完成 PDF 匯出'],
    });
    // 明示：這份投遞版本含已刪素材的副本
    expect(now.deletedMaterials).toEqual(
      expect.arrayContaining([
        { kind: 'source_document', id: t.source.id },
        { kind: 'claim', id: t.fact.id },
      ]),
    );
  });

  it('fails loudly when the PDF file is missing', () => {
    const v = t.exportNow();
    const record = t.apply(v);
    fileStoreInternals(t.files).delete(v.pdfHash); // 模擬檔案遺失
    expect(() => readInterviewInput(t.db, t.files, record.id)).toThrow(StorageError);
    expect(() => readInterviewInput(t.db, t.files, 'missing')).toThrow(StorageError);
  });
});
