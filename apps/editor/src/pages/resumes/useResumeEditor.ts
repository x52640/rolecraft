import type {
  BridgeFailure,
  Claim,
  ClaimCitation,
  ResumeVersion,
  SectionOriginalView,
} from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import type { ResponseOf } from '../../bridge/client.ts';

type JobsList = Extract<ResponseOf<'jobs.list'>, { ok: true }>['snapshots'];
type VersionList = Extract<ResponseOf<'resume.list'>, { ok: true }>['versions'];
export type CheckResult = Extract<ResponseOf<'resume.check_export'>, { ok: true }>;

export interface VersionView {
  version: ResumeVersion;
  originals: readonly SectionOriginalView[];
  /** 段落引用到的事實項（目前狀態）；查不到的不列 */
  claims: ReadonlyMap<string, Claim>;
  check: CheckResult | null;
}

const errorOf = (failure: BridgeFailure) => failure.error.message;

/**
 * 履歷頁的資料與動作：每次寫入後都從 helper 重新讀取版本與匯出前檢查，
 * 畫面只顯示 helper 回來的狀態；確認時間由 helper 決定（R1）。
 */
export function useResumeEditor() {
  const bridge = useBridge();
  const [jobs, setJobs] = useState<JobsList | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionList | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [view, setView] = useState<VersionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [allClaims, setAllClaims] = useState<Claim[] | null>(null);
  // 目前選的職缺／版本與讀取序號：回應回來時比對，丟掉已切走或被較新讀取取代的結果
  const currentJob = useRef<string | null>(null);
  const currentVersion = useRef<string | null>(null);
  const viewSeq = useRef(0);

  useEffect(() => {
    void bridge.send({ op: 'jobs.list', payload: {} }).then((res) => {
      if (!res.ok) {
        setNotice(`無法讀取職缺：${errorOf(res)}`);
        return;
      }
      setJobs(res.snapshots);
      setJobId(res.snapshots[0]?.id ?? null);
    });
  }, [bridge]);

  const loadVersions = useCallback(
    async (id: string) => {
      const res = await bridge.send({ op: 'resume.list', payload: { jobSnapshotId: id } });
      if (currentJob.current !== id) return undefined;
      const next = res.ok ? (res.versions[0]?.resumeVersionId ?? null) : null;
      setVersions(res.ok ? res.versions : []);
      setVersionId(next);
      if (!res.ok) setNotice(errorOf(res));
      return next;
    },
    [bridge],
  );

  const loadView = useCallback(
    async (id: string) => {
      // 已切走的版本（例如舊版本的寫入完成後才回來）不讀，也不能遞增序號，否則會讓目前版本的讀取失效
      if (currentVersion.current !== id) return;
      viewSeq.current += 1;
      const seq = viewSeq.current;
      const stale = () => seq !== viewSeq.current || currentVersion.current !== id;
      const res = await bridge.send({ op: 'resume.get', payload: { resumeVersionId: id } });
      if (stale()) return;
      if (!res.ok) {
        setView(null);
        setNotice(errorOf(res));
        return;
      }
      const ids = new Set(res.version.sections.flatMap((s) => s.citations.map((c) => c.claimId)));
      const claims = new Map<string, Claim>();
      for (const claimId of ids) {
        const got = await bridge.send({ op: 'claims.get', payload: { claimId } });
        if (got.ok) claims.set(claimId, got.claim);
      }
      const check = await bridge.send({
        op: 'resume.check_export',
        payload: { resumeVersionId: id },
      });
      if (stale()) return;
      setView({
        version: res.version,
        originals: res.originals,
        claims,
        check: check.ok ? check : null,
      });
    },
    [bridge],
  );

  useEffect(() => {
    currentJob.current = jobId;
    setVersions(null);
    setView(null);
    if (jobId !== null) void loadVersions(jobId);
  }, [jobId, loadVersions]);

  useEffect(() => {
    currentVersion.current = versionId;
    // 切換版本先清掉舊畫面，避免在新版本上操作到舊版本的段落
    setView(null);
    if (versionId !== null) void loadView(versionId);
  }, [versionId, loadView]);

  /** 執行一個寫入，成功時顯示 okText，之後重新讀取。 */
  async function write(action: () => Promise<{ ok: true } | BridgeFailure>, okText: string) {
    if (versionId === null) return false;
    setBusy(true);
    setNotice(null);
    try {
      const res = await action();
      setNotice(res.ok ? okText : errorOf(res));
      await loadView(versionId);
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  const ref = (sectionId: string) => ({ resumeVersionId: versionId ?? '', sectionId });

  return {
    jobs,
    jobId,
    setJobId,
    versions,
    versionId,
    setVersionId,
    view,
    busy,
    notice,
    allClaims,
    /** 重新讀取版本清單；選到的版本沒變時（effect 不會重跑）也明確重新讀取它的內容。 */
    refresh: async () => {
      if (jobId === null) return;
      const before = currentVersion.current;
      const next = await loadVersions(jobId);
      if (next !== undefined && next !== null && next === before) await loadView(next);
    },
    generate: async () => {
      if (jobId === null) return;
      setBusy(true);
      setNotice(null);
      const res = await bridge.send({ op: 'resume.generate', payload: { jobSnapshotId: jobId } });
      setBusy(false);
      setNotice(
        res.ok
          ? '已開始產生客製履歷；完成後按「重新整理」查看新版本。生成的段落都要逐段把關。'
          : errorOf(res),
      );
    },
    accept: (sectionId: string) =>
      write(
        () => bridge.send({ op: 'resume.accept_section', payload: ref(sectionId) }),
        '已接受措辭。這不代表確認其中的事實項。',
      ),
    reject: (sectionId: string) =>
      write(
        () => bridge.send({ op: 'resume.reject_section', payload: ref(sectionId) }),
        '已退回。這段要重新接受、改寫後接受，或刪除整段，才能匯出。',
      ),
    remove: (sectionId: string) =>
      write(
        () => bridge.send({ op: 'resume.delete_section', payload: ref(sectionId) }),
        '已刪除整段。',
      ),
    confirm: (sectionId: string, text: string) =>
      write(
        () => bridge.send({ op: 'resume.confirm_section', payload: { ...ref(sectionId), text } }),
        '已逐段確認本段內容屬實。',
      ),
    edit: (sectionId: string, text: string, citations: ClaimCitation[], acknowledged: boolean) =>
      write(
        () =>
          bridge.send({
            op: 'resume.edit_section',
            payload: {
              ...ref(sectionId),
              text,
              citations,
              ...(acknowledged ? { completionDowngradeAcknowledged: true as const } : {}),
            },
          }),
        '已儲存；這段回到「待你決定」，請再確認一次後接受。',
      ),
    /** 新增引用用：列出所有專案的事實項。 */
    loadAllClaims: async () => {
      const projects = await bridge.send({ op: 'claims.list_projects', payload: {} });
      if (!projects.ok) return;
      const found: Claim[] = [];
      for (const project of projects.projects) {
        const res = await bridge.send({ op: 'claims.list', payload: { projectId: project.id } });
        if (res.ok) found.push(...res.claims.filter((c) => !found.some((f) => f.id === c.id)));
      }
      setAllClaims(found);
    },
  };
}

export type ResumeEditor = ReturnType<typeof useResumeEditor>;
