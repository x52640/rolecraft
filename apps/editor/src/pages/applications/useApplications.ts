// 投遞紀錄頁的資料：投遞紀錄與可選的匯出版本都只從 helper 取得。
// 只是記錄；這裡沒有任何投遞或送出的動作（D7）。
import type {
  ApplicationRecord,
  BridgeRequestOf,
  ExportVersionSummary,
} from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';

export type ApplicationFields = BridgeRequestOf<'applications.create'>['payload'];

export interface ApplicationsData {
  loading: boolean;
  applications: ApplicationRecord[];
  versions: ExportVersionSummary[];
  /** 讀取投遞紀錄失敗的訊息 */
  applicationsError: string | null;
  /** 讀取匯出版本失敗的訊息；失敗時不能新增（實際投出只能選匯出版本） */
  versionsError: string | null;
  /** 以下動作成功回 null，失敗回給人看的訊息；成功後重新讀取清單 */
  create: (fields: ApplicationFields) => Promise<string | null>;
  update: (applicationId: string, fields: ApplicationFields) => Promise<string | null>;
  remove: (applicationId: string) => Promise<string | null>;
}

export function useApplications(): ApplicationsData {
  const bridge = useBridge();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [versions, setVersions] = useState<ExportVersionSummary[]>([]);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [apps, vers] = await Promise.all([
      bridge.send({ op: 'applications.list', payload: {} }),
      bridge.send({ op: 'export.list_versions', payload: {} }),
    ]);
    if (apps.ok) {
      setApplications(apps.applications);
      setApplicationsError(null);
    } else {
      setApplicationsError(apps.error.message);
    }
    if (vers.ok) {
      setVersions(vers.versions);
      setVersionsError(null);
    } else {
      setVersions([]);
      setVersionsError(vers.error.message);
    }
    setLoading(false);
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const after = useCallback(
    async (response: { ok: true } | { ok: false; error: { message: string } }) => {
      if (!response.ok) return response.error.message;
      await reload();
      return null;
    },
    [reload],
  );

  return {
    loading,
    applications,
    versions,
    applicationsError,
    versionsError,
    create: async (fields) =>
      after(await bridge.send({ op: 'applications.create', payload: fields })),
    update: async (applicationId, fields) =>
      after(
        await bridge.send({ op: 'applications.update', payload: { applicationId, ...fields } }),
      ),
    remove: async (applicationId) =>
      after(await bridge.send({ op: 'applications.delete', payload: { applicationId } })),
  };
}
