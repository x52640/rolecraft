import type { BridgeFailure, Claim, ProjectEvidence } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import type { CompletionChoice } from './ClaimCard.tsx';
import { needsCompletion } from './labels.ts';

export type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T };

/** 一則確認請求：文字一律是畫面上顯示的內容，完成狀態是使用者選的（不替使用者預設）。 */
function confirmPayload(claim: Claim, choice: CompletionChoice) {
  return {
    claimId: claim.id,
    text: claim.text,
    ...(needsCompletion(claim) && choice !== '' ? { completion: choice } : {}),
  };
}

const errorOf = (failure: BridgeFailure) => failure.error.message;

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

  useEffect(() => {
    let live = true;
    void bridge.send({ op: 'claims.list_projects', payload: {} }).then((res) => {
      if (!live) return;
      setProjects(
        res.ok
          ? { state: 'ready', value: res.projects }
          : { state: 'error', message: errorOf(res) },
      );
      if (res.ok && res.projects[0]) setProjectId(res.projects[0].id);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  const reload = useCallback(
    async (id: string) => {
      const res = await bridge.send({ op: 'claims.list', payload: { projectId: id } });
      setClaims(
        res.ok ? { state: 'ready', value: res.claims } : { state: 'error', message: errorOf(res) },
      );
    },
    [bridge],
  );

  useEffect(() => {
    if (projectId === null) return;
    setClaims({ state: 'loading' });
    setChoices({});
    setSelected(new Set());
    void reload(projectId);
  }, [projectId, reload]);

  /** 執行一組寫入，完成後重新讀取並清掉相關選擇。 */
  async function run(ids: string[], action: () => Promise<string | null>) {
    if (projectId === null) return;
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
      setChoices((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.includes(k))),
      );
      setSelected((prev) => new Set([...prev].filter((k) => !ids.includes(k))));
      await reload(projectId);
    } finally {
      setBusy(false);
    }
  }

  const choiceOf = (id: string): CompletionChoice => choices[id] ?? '';

  return {
    projects,
    projectId,
    setProjectId,
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
        return res.ok ? '已確認。' : errorOf(res);
      }),
    update: (claim: Claim, text: string) =>
      run([claim.id], async () => {
        const res = await bridge.send({
          op: 'claims.update',
          payload: { claimId: claim.id, text },
        });
        return res.ok ? '已修改；原本的確認已失效，請重新確認。' : errorOf(res);
      }),
    reject: (claim: Claim) =>
      run([claim.id], async () => {
        const res = await bridge.send({ op: 'claims.reject', payload: { claimId: claim.id } });
        return res.ok ? '已刪除，之後不會用於生成。' : errorOf(res);
      }),
    /** 批次確認：只送勾選且複核狀態正常的項目；功能／交付物都要先選好完成狀態，否則一項都不送。 */
    confirmSelected: (list: readonly Claim[]) => {
      const targets = list.filter((c) => selected.has(c.id) && c.reviewStatus === 'normal');
      if (targets.length === 0) return Promise.resolve();
      if (targets.some((c) => needsCompletion(c) && choiceOf(c.id) === '')) {
        setNotice('所選的功能／交付物要先選擇「確認為」已完成或計畫中，才能批次確認。');
        return Promise.resolve();
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
          return failed === 0
            ? `已確認 ${String(done)} 項。`
            : `已確認 ${String(done)} 項，${String(failed)} 項失敗。`;
        },
      );
    },
  };
}
