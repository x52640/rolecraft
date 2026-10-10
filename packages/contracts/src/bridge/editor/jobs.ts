import { z } from 'zod';

import { CaptureMethod, Id, NonEmptyText, Platform, Timestamp } from '../../entities/common.ts';
import { JobFields, JobSnapshot } from '../../entities/job-snapshot.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * jobs.*：職缺快照（F06、R10；P1-T019）。
 * 建立快照（自動擷取或手動貼上）走 submit_job_capture；這裡只有檢視、修改、確認。
 */

/** 列表用摘要：不帶職缺描述全文，避免清單過大。 */
export const JobSnapshotSummary = z.strictObject({
  id: Id,
  platform: Platform,
  captureMethod: CaptureMethod,
  company: NonEmptyText,
  title: NonEmptyText,
  capturedAt: Timestamp,
  userModified: z.boolean(),
  confirmedAt: Timestamp.nullable(),
});
export type JobSnapshotSummary = z.infer<typeof JobSnapshotSummary>;

const JobRef = z.strictObject({ jobSnapshotId: OpaqueId });

export const JOBS_SCHEMAS = {
  /** 列出所有職缺快照摘要。 */
  'jobs.list': {
    request: bridgeOp('jobs.list', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), snapshots: z.array(JobSnapshotSummary) }),
    ),
  },
  /** 取得單一快照全文。 */
  'jobs.get': {
    request: bridgeOp('jobs.get', JobRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), snapshot: JobSnapshot })),
  },
  /**
   * 修改快照欄位：記為使用者改過，並清除既有確認（改過要重新確認才能用於生成）。
   * 擷取方式不能改（手動不得改標成自動，R10）。
   */
  'jobs.update': {
    request: bridgeOp(
      'jobs.update',
      z.strictObject({ jobSnapshotId: OpaqueId, fields: JobFields }),
    ),
    response: withFailure(Ack),
  },
  /** 使用者確認快照；確認後才能用於生成（R10）。 */
  'jobs.confirm': {
    request: bridgeOp('jobs.confirm', JobRef),
    response: withFailure(Ack),
  },
} as const;
