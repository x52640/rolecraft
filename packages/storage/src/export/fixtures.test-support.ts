import path from 'node:path';

import type { ExportVersion } from '@rolecraft/contracts';

import {
  claim,
  jobSnapshot,
  resumeVersion,
  sourceDocument,
  tempDatabase,
} from '../__fixtures__/entities.ts';
import { createApplicationRecordRepository } from '../application/application-record-repository.ts';
import { createLocalFileStore } from '../files/file-store.ts';
import { createRepositories } from '../repositories/index.ts';
import {
  createExportVersionRepository,
  type ExportVersionInput,
} from './export-version-repository.ts';

/** 測試共用：暫存資料庫＋檔案區＋一組素材（來源文件、事實項、職缺快照、履歷版本）。 */
export function exportTestbed() {
  const t = tempDatabase();
  const files = createLocalFileStore(path.join(t.dir, 'files'));
  const repos = createRepositories(t.db);
  const exports = createExportVersionRepository(t.db, files);
  const applications = createApplicationRecordRepository(t.db, files);

  const source = repos.sourceDocuments.save(sourceDocument());
  const fact = repos.claims.save(claim(source.id));
  const job = repos.jobSnapshots.save(jobSnapshot());
  const resume = repos.resumeVersions.save(resumeVersion(job.id, fact.id));

  /** 由目前的履歷版本、事實項、職缺快照組出匯出內容（模擬匯出流程做副本） */
  const exportInput = (): ExportVersionInput => {
    const rv = repos.resumeVersions.get(resume.id);
    const c = repos.claims.get(fact.id);
    const js = repos.jobSnapshots.get(job.id);
    if (!rv || !c || !js) throw new Error('fixture material missing');
    return {
      resumeVersionId: rv.id,
      sections: rv.sections,
      citedClaims: [
        {
          claimId: c.id,
          claimText: c.text,
          excerptTexts: c.basis.sourceExcerpts.map((e) => e.text),
        },
      ],
      jobSnapshot: js,
    };
  };

  let pdfCounter = 0;
  /** 每次內容不同的假 PDF */
  const pdf = (label = `pdf-${++pdfCounter}`) => new TextEncoder().encode(`%PDF-1.7 ${label}`);

  const exportNow = (label?: string): ExportVersion => exports.create(exportInput(), pdf(label));

  const apply = (version: ExportVersion) =>
    applications.create({
      initiation: 'proactive',
      appliedAt: '2026-10-11T09:00:00.000Z',
      status: '已投遞',
      exportVersionId: version.id,
    });

  return {
    ...t,
    files,
    repos,
    exports,
    applications,
    source,
    fact,
    job,
    resume,
    exportInput,
    pdf,
    exportNow,
    apply,
  };
}
