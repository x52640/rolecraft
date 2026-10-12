// IntroService 的 storage 實作（P1-T064，D25、D6、D7、R1、R5、R6、R8、R10）。
// - 產生只由使用者按下觸發，在背景送出一次（不自動重試）；最近一次產生狀態只存在 helper 記憶體。
// - 輸入：已確認的職缺快照、唯一且已確認的個人資料、過來源關卡後可用的事實項（claim-gate.ts）。
// - 執行經選定服務的 execute（訂閱檢查包裝，R5、R6 每次重做），R6 紀錄逐次保存。
// - 通過檢查才寫入；寫入前快照必須仍是當時那份確認、自介仍是當時那份（使用者期間改過就不覆蓋）。
// - 讀取與儲存編輯時，依目前的事實項重跑檢查（check-view.ts）；R1 類不通過時編輯器停用複製，
//   承諾字眼只提示（D25）。沒有任何送出功能（D7）。
// - 檢查不通過的輸出保留成未通過草稿（drafts.ts，只在記憶體，P1-T071）：使用者可修改後儲存，或按「請 AI 修正」
//   帶問題回饋重寫一次（fix；寫入前比對的是草稿產生前的已存自介）。重新產生（非修正）時先捨棄舊草稿。
import {
  type ApplicationIntro,
  type IntroCheckView,
  type IntroGenerationView,
} from '@rolecraft/contracts';
import {
  confirmedProfile,
  prepareIntro,
  runIntro,
  usableClaims,
  type IntroPrepareFailure,
  type IntroRunResult,
  type PreparedIntro,
} from '@rolecraft/pipeline';
import { newId as storageId, transaction, type Repositories } from '@rolecraft/storage';
import type { DatabaseSync } from 'node:sqlite';

import type { GenerationEngine } from '../resume/generation.ts';
import type { ClaimGate } from '../sources/claim-gate.ts';
import { introCheckView } from './check-view.ts';
import { holdDraft, sameIntro, saveDraft, type HeldDraft } from './drafts.ts';
import type { GenerateIntroResult, IntroRefusal, IntroService } from './service.ts';

export interface IntroServiceDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly engine: GenerationEngine;
  /** 引用來源已撤銷或不在授權集合的事實項當來源已移除（P1-T060）；沒給就不套 */
  readonly gate?: ClaimGate | null;
  readonly newId?: () => string;
  readonly now?: () => number;
  /** 測試用：背景產生結束時通知 */
  readonly onSettled?: (jobSnapshotId: string) => void;
}

const PREPARE_REFUSALS: Record<IntroPrepareFailure, IntroRefusal> = {
  snapshot_missing: 'not_found',
  snapshot_not_confirmed: 'snapshot_not_confirmed',
  no_usable_claims: 'no_usable_claims',
  over_budget: 'over_budget',
};

const RUNNING: IntroGenerationView = { state: 'running', failure: null, problem: null };
const SUCCEEDED: IntroGenerationView = { state: 'succeeded', failure: null, problem: null };

function failedView(result: Extract<IntroRunResult, { ok: false }>): IntroGenerationView {
  return { state: 'failed', failure: result.failure, problem: result.problem };
}

export function createIntroService(deps: IntroServiceDeps): Required<IntroService> {
  const { db, repos, engine } = deps;
  const makeId = deps.newId ?? storageId;
  const now = deps.now ?? Date.now;
  const iso = () => new Date(now()).toISOString();
  const gate = deps.gate ?? null;
  const generations = new Map<string, IntroGenerationView>();
  const drafts = new Map<string, HeldDraft>();
  const starting = new Map<string, Promise<GenerateIntroResult>>();

  async function currentClaims() {
    await gate?.refresh();
    const claims = repos.claims.list();
    return gate ? gate.apply(claims) : claims;
  }

  /** 只有一份且已確認的個人資料才算（與履歷生成相同）。 */
  function profile() {
    const profiles = repos.profiles.list();
    return profiles.length === 1 ? confirmedProfile(profiles[0]) : null;
  }

  /** 已確認職缺快照的公司名稱與職稱（名稱裡的數字只在名稱內算有出處）；未確認不給。 */
  function jobNames(jobSnapshotId: string): string[] {
    const snapshot = repos.jobSnapshots.get(jobSnapshotId);
    if (!snapshot || snapshot.confirmedAt === null) return [];
    return [snapshot.fields.company, snapshot.fields.title];
  }

  async function checkOf(intro: ApplicationIntro): Promise<IntroCheckView> {
    return introCheckView(intro, await currentClaims(), profile(), jobNames(intro.jobSnapshotId));
  }

  /** 通過檢查的結果在同一交易寫入；快照或自介在產生期間變了就不寫。 */
  function commit(
    prepared: PreparedIntro,
    before: ApplicationIntro | null,
    result: IntroRunResult,
  ): IntroGenerationView {
    if (!result.ok) return failedView(result);
    const id = prepared.jobSnapshotId;
    return transaction(db, (): IntroGenerationView => {
      const snapshot = repos.jobSnapshots.get(id);
      if (snapshot?.confirmedAt !== prepared.snapshotConfirmedAt) {
        return { state: 'failed', failure: 'snapshot_changed', problem: null };
      }
      if (!sameIntro(repos.applicationIntros.get(id), before)) {
        return { state: 'failed', failure: 'intro_changed', problem: null };
      }
      repos.applicationIntros.save({
        jobSnapshotId: id,
        text: result.text,
        citations: [...result.citations],
        generatedAt: iso(),
        userEdited: false,
      });
      return SUCCEEDED;
    });
  }

  /** 產生結束：成功寫入就捨棄草稿；檢查不通過把輸出留成新的草稿；其他失敗保留原草稿（修正可再按）。 */
  function settleDrafts(
    prepared: PreparedIntro,
    before: ApplicationIntro | null,
    result: IntroRunResult,
    view: IntroGenerationView,
  ) {
    const id = prepared.jobSnapshotId;
    if (view.state === 'succeeded') drafts.delete(id);
    else if (!result.ok && result.draft) {
      drafts.set(id, holdDraft(result.draft, before, prepared.snapshotConfirmedAt, iso()));
    }
  }

  async function begin(jobSnapshotId: string, fix: boolean): Promise<GenerateIntroResult> {
    const current = generations.get(jobSnapshotId);
    if (current?.state === 'running') return { ok: true, generation: current };
    const jobSnapshot = repos.jobSnapshots.get(jobSnapshotId);
    if (!jobSnapshot) return { ok: false, reason: 'not_found' };
    if (jobSnapshot.confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
    const held = fix ? drafts.get(jobSnapshotId) : undefined;
    if (fix && !held) return { ok: false, reason: 'no_draft' };
    if (held && held.snapshotConfirmedAt !== jobSnapshot.confirmedAt) {
      return { ok: false, reason: 'draft_stale' };
    }
    const claims = await currentClaims();
    if (usableClaims(claims).length === 0) return { ok: false, reason: 'no_usable_claims' };
    const selection = await engine.select();
    if (selection === null) return { ok: false, reason: 'no_service' };
    if (fix && drafts.get(jobSnapshotId) !== held) return { ok: false, reason: 'no_draft' };
    // 修正結果只能寫在草稿產生前那份已存自介上：之後被改過就注定寫不進去，不呼叫模型、不耗額度
    if (held && !sameIntro(repos.applicationIntros.get(jobSnapshotId), held.before)) {
      return { ok: false, reason: 'draft_intro_changed' };
    }
    const inputs = { jobSnapshot, profile: profile(), claims };
    const { draft } = held ?? {};
    const feedback = draft
      ? { previous: draft.text, problem: draft.problem, fragments: draft.fragments }
      : null;
    const prepared = prepareIntro(jobSnapshotId, inputs, selection.budget, makeId, feedback);
    if (!prepared.ok) return { ok: false, reason: PREPARE_REFUSALS[prepared.reason] };

    // 修正：寫入前比對草稿產生前的已存自介（不蓋掉使用者之後的修改）；重新產生：捨棄舊草稿
    const before = held ? held.before : repos.applicationIntros.get(jobSnapshotId);
    if (!held) drafts.delete(jobSnapshotId);
    generations.set(jobSnapshotId, RUNNING);
    const settle = (view: IntroGenerationView) => {
      generations.set(jobSnapshotId, view);
      deps.onSettled?.(jobSnapshotId);
    };
    void runIntro(prepared.prepared, {
      provider: selection.provider,
      model: selection.model,
      execute: (request) => selection.execute(request),
      signal: new AbortController().signal,
      recordRunCheck: (record) => {
        repos.runCheckRecords.append(record);
        return Promise.resolve();
      },
    })
      .then((result) => {
        const view = commit(prepared.prepared, before, result);
        settleDrafts(prepared.prepared, before, result, view);
        return view;
      })
      .then(settle, () => settle({ state: 'failed', failure: 'provider_error', problem: null }));
    return { ok: true, generation: RUNNING };
  }

  return {
    generate(jobSnapshotId, options) {
      // 同時按兩次：共用同一次啟動，不會送兩次
      let pending = starting.get(jobSnapshotId);
      if (!pending) {
        pending = begin(jobSnapshotId, options?.fix === true).finally(() =>
          starting.delete(jobSnapshotId),
        );
        starting.set(jobSnapshotId, pending);
      }
      return pending;
    },

    async get(jobSnapshotId) {
      if (!repos.jobSnapshots.get(jobSnapshotId)) return null;
      const intro = repos.applicationIntros.get(jobSnapshotId);
      return {
        intro,
        check: intro ? await checkOf(intro) : null,
        generation: generations.get(jobSnapshotId) ?? null,
        draft: drafts.get(jobSnapshotId)?.draft ?? null,
      };
    },

    async update(jobSnapshotId, text, options) {
      if (!repos.jobSnapshots.get(jobSnapshotId)) return { ok: false, reason: 'not_found' };
      if (options?.draft) {
        if (generations.get(jobSnapshotId)?.state === 'running') {
          return { ok: false, reason: 'generation_running' };
        }
        const saveDeps = { db, repos, drafts, claims: currentClaims, profile, jobNames, now: iso };
        const result = await saveDraft(saveDeps, jobSnapshotId, text);
        // 草稿成為正式自介：先前「產生沒通過」的狀態已不適用
        if (result.ok) generations.delete(jobSnapshotId);
        return result;
      }
      const current = repos.applicationIntros.get(jobSnapshotId);
      if (!current) return { ok: false, reason: 'no_intro' };
      const intro =
        current.text === text
          ? current
          : repos.applicationIntros.save({ ...current, text, userEdited: true });
      return { ok: true, intro, check: await checkOf(intro) };
    },
  };
}
