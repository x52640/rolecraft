// 匯出版本服務（P1-T040）：export.create 見 export-create.ts；這裡是讀取（清單、單一版本、PDF 分塊）。
// 只讀不可變的匯出版本（R3），不提供修改；查不到的 id 回 invalid_request（bridge.md 共同規則）。
import type { BridgeFailure, ExportVersion, ExportVersionSummary } from '@rolecraft/contracts';
import type { ExportVersionRepository } from '@rolecraft/storage';

import { chunkOf } from './chunks.ts';
import { createExport, type ExportCreateDeps } from './export-create.ts';
import type { ExportService } from './service.ts';

export interface ExportServiceDeps extends ExportCreateDeps {
  readonly exports: Pick<ExportVersionRepository, 'create' | 'get' | 'list' | 'readPdf'>;
}

const notFound: BridgeFailure = {
  ok: false,
  error: { code: 'invalid_request', message: '找不到這個匯出版本' },
};

function summaryOf(version: ExportVersion, pdfBytes: number): ExportVersionSummary {
  return {
    exportVersionId: version.id,
    resumeVersionId: version.resumeVersionId,
    jobSnapshotId: version.jobSnapshot.id,
    company: version.jobSnapshot.fields.company,
    title: version.jobSnapshot.fields.title,
    exportedAt: version.exportedAt,
    pdfHash: version.pdfHash,
    pdfBytes,
  };
}

export function createExportService(deps: ExportServiceDeps): Required<ExportService> {
  return {
    create: (payload) => createExport(deps, payload.resumeVersionId),
    listVersions() {
      // readPdf 會驗雜湊；檔案遺失或被改動時拋錯，由分派層回 internal_error
      const versions = deps.exports
        .list()
        .map((v) => summaryOf(v, deps.exports.readPdf(v).byteLength));
      return Promise.resolve({ ok: true, versions });
    },
    getVersion({ exportVersionId }) {
      const version = deps.exports.get(exportVersionId);
      return Promise.resolve(version === null ? notFound : { ok: true, version });
    },
    readPdf({ exportVersionId, chunkIndex }) {
      const version = deps.exports.get(exportVersionId);
      if (version === null) return Promise.resolve(notFound);
      const chunk = chunkOf(deps.exports.readPdf(version), chunkIndex);
      return Promise.resolve(
        chunk === null
          ? { ok: false, error: { code: 'invalid_request', message: '塊序號超出範圍' } }
          : { ok: true, chunk },
      );
    },
  };
}
