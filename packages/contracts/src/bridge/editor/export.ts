import { z } from 'zod';

import { ContentHash, Id, NonEmptyText, Timestamp } from '../../entities/common.ts';
import { ExportVersion } from '../../entities/export-version.ts';
import { BinaryChunk, ChunkIndex } from '../chunk.ts';
import { EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * export.*：匯出不可變版本與讀取 PDF（F07、R1、R3；P1-T040）。
 * 匯出不等於投遞；R1 未過不得匯出。PDF 以分塊讀取（chunk.ts）。
 */

/** 匯出版本清單的一列（不含全文與 PDF）。 */
export const ExportVersionSummary = z.strictObject({
  exportVersionId: Id,
  resumeVersionId: Id,
  jobSnapshotId: Id,
  company: NonEmptyText,
  title: NonEmptyText,
  exportedAt: Timestamp,
  pdfHash: ContentHash,
  pdfBytes: z.int().min(0),
});
export type ExportVersionSummary = z.infer<typeof ExportVersionSummary>;

/** 匯出結果：R1 檢查未過時回 not_ready，細節用 resume.check_export 取得。 */
export const ExportOutcome = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('exported'), exportVersionId: Id }),
  z.strictObject({ status: z.literal('not_ready') }),
]);
export type ExportOutcome = z.infer<typeof ExportOutcome>;

const VersionRef = z.strictObject({ exportVersionId: OpaqueId });

export const EXPORT_SCHEMAS = {
  /** 以某個履歷版本匯出 PDF，建立不可變匯出版本（R3）。 */
  'export.create': {
    request: bridgeOp('export.create', z.strictObject({ resumeVersionId: OpaqueId })),
    response: withFailure(z.strictObject({ ok: z.literal(true), outcome: ExportOutcome })),
  },
  'export.list_versions': {
    request: bridgeOp('export.list_versions', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), versions: z.array(ExportVersionSummary) }),
    ),
  },
  'export.get_version': {
    request: bridgeOp('export.get_version', VersionRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), version: ExportVersion })),
  },
  /** 讀匯出 PDF 的第 chunkIndex 塊；超出範圍回 invalid_request。 */
  'export.read_pdf': {
    request: bridgeOp(
      'export.read_pdf',
      z.strictObject({ exportVersionId: OpaqueId, chunkIndex: ChunkIndex }),
    ),
    response: withFailure(z.strictObject({ ok: z.literal(true), chunk: BinaryChunk })),
  },
} as const;
