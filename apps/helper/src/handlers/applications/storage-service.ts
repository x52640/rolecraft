// 以 storage 實作 ApplicationsService（P1-T028）。
// storage 連線與檔案區由 helper 服務組裝提供（P1-T040 的 apps/helper/src/services/）；這裡只用 repository。
import type { ApplicationRecordRepository, ExportVersionRepository } from '@rolecraft/storage';

import type { ApplicationsService } from './service.ts';

export interface ApplicationsStore {
  applications: ApplicationRecordRepository;
  /** 只用來確認匯出版本存在（R3：實際投出只能指向不可變的匯出版本） */
  exportVersions: Pick<ExportVersionRepository, 'get'>;
}

/** 投遞日期一律存成 UTC（storage 依字串排序投遞日期，混用時區會排錯）。 */
function toUtc(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

export function createApplicationsService(store: ApplicationsStore): ApplicationsService {
  const { applications, exportVersions } = store;
  return {
    list: () => Promise.resolve(applications.list()),

    create(fields) {
      if (!exportVersions.get(fields.exportVersionId)) {
        return Promise.resolve({ ok: false, reason: 'export_version_not_found' });
      }
      const record = applications.create({
        initiation: fields.initiation,
        appliedAt: toUtc(fields.appliedAt),
        status: fields.status,
        exportVersionId: fields.exportVersionId,
      });
      return Promise.resolve({ ok: true, value: { applicationId: record.id } });
    },

    update(applicationId, fields) {
      const current = applications.get(applicationId);
      if (!current) return Promise.resolve({ ok: false, reason: 'application_not_found' });
      if (current.exportVersionId !== fields.exportVersionId) {
        return Promise.resolve({ ok: false, reason: 'export_version_locked' });
      }
      applications.update(applicationId, {
        initiation: fields.initiation,
        appliedAt: toUtc(fields.appliedAt),
        status: fields.status,
      });
      return Promise.resolve({ ok: true, value: null });
    },

    delete(applicationId) {
      const { deleted } = applications.delete(applicationId);
      if (!deleted) return Promise.resolve({ ok: false, reason: 'application_not_found' });
      return Promise.resolve({ ok: true, value: null });
    },
  };
}
