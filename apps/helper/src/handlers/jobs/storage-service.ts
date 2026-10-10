// JobsService 的 storage 實作（P1-T019，F06、R10）。
// 每個方法內的讀改寫都是同步的（node:sqlite），不會被其他請求插隊。
import { JobFields, type JobSnapshot, type JobSnapshotSummary } from '@rolecraft/contracts';
import { newId, nowTimestamp, type JobSnapshotRepository } from '@rolecraft/storage';

import type { JobsService } from './service.ts';

export interface JobsServiceOptions {
  /** 測試用：固定時間。 */
  now?: () => string;
  /** 測試用：固定 ID。 */
  newId?: () => string;
}

function summarize(snapshot: JobSnapshot): JobSnapshotSummary {
  return {
    id: snapshot.id,
    platform: snapshot.platform,
    captureMethod: snapshot.captureMethod,
    company: snapshot.fields.company,
    title: snapshot.fields.title,
    capturedAt: snapshot.capturedAt,
    userModified: snapshot.userModified,
    confirmedAt: snapshot.confirmedAt,
  };
}

/** 兩份欄位內容是否相同（都先經 schema 正規化，鍵順序一致）。 */
function sameFields(a: JobFields, b: JobFields): boolean {
  return JSON.stringify(JobFields.parse(a)) === JSON.stringify(JobFields.parse(b));
}

export function createJobsService(
  repo: JobSnapshotRepository,
  options: JobsServiceOptions = {},
): Required<JobsService> {
  const now = options.now ?? (() => nowTimestamp());
  const makeId = options.newId ?? newId;

  return {
    submitCapture(payload) {
      const snapshot = repo.save({
        id: makeId(),
        platform: payload.platform,
        url: payload.url,
        capturedAt: payload.capturedAt,
        // 擷取方式照實記錄；之後任何操作都不能改（R10）。
        captureMethod: payload.captureMethod,
        fields: payload.fields,
        userModified: false,
        confirmedAt: null,
      });
      return Promise.resolve({ jobSnapshotId: snapshot.id });
    },

    list() {
      return Promise.resolve(repo.list().map(summarize));
    },

    get(jobSnapshotId) {
      return Promise.resolve(repo.get(jobSnapshotId));
    },

    update(jobSnapshotId, fields) {
      const current = repo.get(jobSnapshotId);
      if (!current) return Promise.resolve(null);
      // 內容沒變：不算修改，既有確認仍對應同一份內容。
      if (sameFields(current.fields, fields)) return Promise.resolve(current);
      return Promise.resolve(
        repo.save({ ...current, fields, userModified: true, confirmedAt: null }),
      );
    },

    confirm(jobSnapshotId) {
      const current = repo.get(jobSnapshotId);
      if (!current) return Promise.resolve(null);
      return Promise.resolve(repo.save({ ...current, confirmedAt: now() }));
    },
  };
}
