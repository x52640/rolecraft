import type { BridgeFailure, Claim, ProjectEvidence } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { useAnalysis } from '../projects/useAnalysis.ts';
import type { CompletionChoice } from './ClaimCard.tsx';
import { needsCompletion } from './labels.ts';

export type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T };

/** 一則確認請求：文字一律是畫面上顯示的內容，完成狀態是使用者選的（不替使用者預設）。 */
function confirmPayload(claim: Claim, choice: CompletionChoice) {
  return {
    claimId: claim.id,
    text: claim.text,
    // 畫面當時看到的複核狀態：helper 比對不符就拒絕（R2），之後重新讀取
    expectedReviewStatus: claim.reviewStatus,
    ...(needsCompletion(claim) && choice !== '' ? { completion: choice } : {}),
  };
}

const errorOf = (failure: BridgeFailure) => failure.error.message;

/** 選單上「未歸專案」的值（D23）。專案 ID 不會是空字串，不會撞到。 */
export const UNASSIGNED = '';

/**
 * 事實項頁的資料與動作。每次寫入後都從 helper 重新讀取，畫面只顯示 helper 回來的狀態；
 * 確認時間由 helper 決定（R1、D14）。
 */
export function useClaimsReview() {
  const bridge = useBridge();
  const [projects, setProjects] = useState<Load<ProjectEvidence[]>>({ state: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Load<Claim[]> | null>(null);
  const [choices, setChoices] = useState<Record<string, CompletionChoice>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 目前選的專案（或 UNASSIGNED）：讀取回來時比對，丟掉已切走的回應，避免舊清單蓋掉新清單
  const currentProject = useRef<string | null>(null);
  // 分析（P1-T060）在這頁開著時跑完：重新讀專案與目前專案的事實項
  const [generation, setGeneration] = useState(0);
  const onAnalysisFinished = useCallback(() => setGeneration((g) => g + 1), []);
  useAnalysis(onAnalysisFinished);

  // 使用者自己選過專案（P1-T063）：自動預設的選擇在重新整理時重算，使用者選的保留（專案還在的話）
  const userPicked = useRef(false);

  useEffect(() => {
    let live = true;
    void Promise.all([
      bridge.send({ op: 'claims.list_projects', payload: {} }),
      bridge.send({ op: 'claims.list_unassigned', payload: {} }),
    ]).then(([res, unassigned]) => {
      if (!live) return;
      setProjects(
        res.ok
          ? { state: 'ready', value: res.projects }
          : { state: 'error', message: errorOf(res) },
      );
      if (!res.ok) return;
      // 自動預設（D23）：有未歸專案的事實項、沒有專案，或未歸專案清單讀不到（停在未歸專案讓錯誤顯示出來，
      // 不靜默選第一個專案）時顯示未歸專案，否則第一個專案
      const first = res.projects[0];
      const hasUnassigned = !unassigned.ok || unassigned.claims.length > 0;
      const fallback = hasUnassigned || !first ? UNASSIGNED : first.id;
      setProjectId((current) => {
        const exists = current === UNASSIGNED || res.projects.some((p) => p.id === current);
        if (current !== null && userPicked.current && exists) return current;
        userPicked.current = false;
        return fallback;
      });
    });
    return () => {
      live = false;
    };
  }, [bridge, generation]);

  const reload = useCallback(
    async (id: string) => {
      const res =
        id === UNASSIGNED
          ? await bridge.send({ op: 'claims.list_unassigned', payload: {} })
          : await bridge.send({ op: 'claims.list', payload: { projectId: id } });
      if (currentProject.current !== id) return;
      setClaims(
        res.ok ? { state: 'ready', value: res.claims } : { state: 'error', message: errorOf(res) },
      );
    },
    [bridge],
  );

  useEffect(() => {
    currentProject.current = projectId;
    if (projectId === null) return;
    setClaims({ state: 'loading' });
    setChoices({});
    setSelected(new Set());
    void reload(projectId);
  }, [projectId, reload, generation]);

  /** 執行一組寫入，完成後重新讀取並清掉相關選擇；回傳寫入是否成功。 */
  async function run(
    ids: string[],
    action: () => Promise<{ ok: boolean; notice: string | null }>,
  ): Promise<boolean> {
    if (projectId === null) return false;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result.notice);
      setChoices((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.includes(k))),
      );
      setSelected((prev) => new Set([...prev].filter((k) => !ids.includes(k))));
      await reload(projectId);
      return result.ok;
    } finally {
      setBusy(false);
    }
  }

  const choiceOf = (id: string): CompletionChoice => choices[id] ?? '';

  return {
    projects,
    projectId,
    /** 使用者在選單上選的：之後重新整理時保留 */
    setProjectId: (id: string) => {
      userPicked.current = true;
      setProjectId(id);
    },
    /** 專案改名、合併、刪除後：重新讀專案清單與目前清單（目前專案不在了就回到自動預設） */
    projectsChanged: () => setGeneration((g) => g + 1),
    claims,
    busy,
    notice,
    selected,
    choiceOf,
    setChoice: (id: string, choice: CompletionChoice) =>
      setChoices((p) => ({ ...p, [id]: choice })),
    setSelectedOne: (id: string, on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    confirm: (claim: Claim) =>
      run([claim.id], async () => {
        const res = await bridge.send({
          op: 'claims.confirm',
          payload: confirmPayload(claim, choiceOf(claim.id)),
        });
        return { ok: res.ok, notice: res.ok ? '已確認。' : errorOf(res) };
      }),
    update: (claim: Claim, text: string) =>
      run([claim.id], async () => {
        const res = await bridge.send({
          op: 'claims.update',
          payload: { claimId: claim.id, text },
        });
        return {
          ok: res.ok,
          notice: res.ok
            ? '已修改；原本的確認已失效，舊來源不再替新內容背書，請對照原文重新確認。'
            : errorOf(res),
        };
      }),
    /** 移到另一專案（projectId）或移回未歸專案（null）（D23）。 */
    move: (claim: Claim, target: string | null) =>
      run([claim.id], async () => {
        const res = await bridge.send({
          op: 'claims.move_claim',
          payload: { claimId: claim.id, projectId: target },
        });
        return {
          ok: res.ok,
          notice: res.ok
            ? target === null
              ? '已移回未歸專案。'
              : '已移到所選專案。'
            : errorOf(res),
        };
      }),
    reject: (claim: Claim) =>
      run([claim.id], async () => {
        const res = await bridge.send({ op: 'claims.reject', payload: { claimId: claim.id } });
        return { ok: res.ok, notice: res.ok ? '已刪除，之後不會用於生成。' : errorOf(res) };
      }),
    /** 批次確認：只送勾選且複核狀態正常的項目；功能／交付物都要先選好完成狀態，否則一項都不送。 */
    confirmSelected: (list: readonly Claim[]) => {
      const targets = list.filter((c) => selected.has(c.id) && c.reviewStatus === 'normal');
      if (targets.length === 0) return Promise.resolve(false);
      if (targets.some((c) => needsCompletion(c) && choiceOf(c.id) === '')) {
        setNotice('所選的功能／交付物要先選擇「確認為」已完成或計畫中，才能批次確認。');
        return Promise.resolve(false);
      }
      return run(
        targets.map((c) => c.id),
        async () => {
          let failed = 0;
          for (const claim of targets) {
            const res = await bridge.send({
              op: 'claims.confirm',
              payload: confirmPayload(claim, choiceOf(claim.id)),
            });
            if (!res.ok) failed += 1;
          }
          const done = targets.length - failed;
          return {
            ok: failed === 0,
            notice:
              failed === 0
                ? `已確認 ${String(done)} 項。`
                : `已確認 ${String(done)} 項，${String(failed)} 項失敗。`,
          };
        },
      );
    },
  };
}
