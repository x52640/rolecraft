// 匯出版本服務（P1-T040）：export.create 見 export-create.ts；這裡是讀取（清單、單一版本、PDF 分塊）。
// 只讀不可變的匯出版本（R3），不提供修改；查不到的 id 回 invalid_request（bridge.md 共同規則）。
import type { BridgeFailure, ExportVersion, ExportVersionSummary } from '@rolecraft/contracts';
import { StorageError, type ExportVersionRepository } from '@rolecraft/storage';

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

/** PDF 大小；檔案遺失或內容與雜湊不符回 null（其他錯誤照拋）。 */
function pdfBytesOf(deps: ExportServiceDeps, version: ExportVersion): number | null {
  try {
    return deps.exports.readPdf(version).byteLength;
  } catch (error) {
    if (error instanceof StorageError) return null;
    throw error;
  }
}

export function createExportService(deps: ExportServiceDeps): Required<ExportService> {
  return {
    create: (payload) => createExport(deps, payload.resumeVersionId),
    listVersions() {
      // readPdf 會驗雜湊。單一版本的 PDF 遺失或被改動時只略過該筆（不能填假的大小，
      // contracts 也沒有「檔案損壞」標記），其他版本照常列出；該版本仍可用 get_version 讀內容。
      const versions = deps.exports.list().flatMap((v) => {
        const bytes = pdfBytesOf(deps, v);
        return bytes === null ? [] : [summaryOf(v, bytes)];
      });
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
