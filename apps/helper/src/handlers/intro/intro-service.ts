// IntroService 的 storage 實作（P1-T064，D25、D6、D7、R1、R5、R6、R8、R10）。
// - 產生只由使用者按下觸發，在背景送出一次（不自動重試）；最近一次產生狀態只存在 helper 記憶體。
// - 輸入：已確認的職缺快照、唯一且已確認的個人資料、過來源關卡後可用的事實項（claim-gate.ts）。
// - 執行經選定服務的 execute（訂閱檢查包裝，R5、R6 每次重做），R6 紀錄逐次保存。
// - 通過檢查才寫入；寫入前快照必須仍是當時那份確認、自介仍是當時那份（使用者期間改過就不覆蓋）。
// - 讀取與儲存編輯時，依目前的事實項重跑同一套檢查；不通過時編輯器停用複製。沒有任何送出功能（D7）。
import {
  introLength,
  type ApplicationIntro,
  type IntroCheckView,
  type IntroGenerationView,
} from '@rolecraft/contracts';
import {
  checkIntro,
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

const sameIntro = (a: ApplicationIntro | null, b: ApplicationIntro | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function createIntroService(deps: IntroServiceDeps): Required<IntroService> {
  const { db, repos, engine } = deps;
  const makeId = deps.newId ?? storageId;
  const now = deps.now ?? Date.now;
  const gate = deps.gate ?? null;
  const generations = new Map<string, IntroGenerationView>();
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

  async function checkOf(intro: ApplicationIntro): Promise<IntroCheckView> {
    const claims = usableClaims(await currentClaims());
    const problem = checkIntro(intro.text, intro.citations, { claims, profile: profile() });
    return { length: introLength(intro.text), problem };
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
        generatedAt: new Date(now()).toISOString(),
        userEdited: false,
      });
      return SUCCEEDED;
    });
  }

  async function begin(jobSnapshotId: string): Promise<GenerateIntroResult> {
    const current = generations.get(jobSnapshotId);
    if (current?.state === 'running') return { ok: true, generation: current };
    const jobSnapshot = repos.jobSnapshots.get(jobSnapshotId);
    if (!jobSnapshot) return { ok: false, reason: 'not_found' };
    if (jobSnapshot.confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
    const claims = await currentClaims();
    if (usableClaims(claims).length === 0) return { ok: false, reason: 'no_usable_claims' };
    const selection = await engine.select();
    if (selection === null) return { ok: false, reason: 'no_service' };
    const inputs = { jobSnapshot, profile: profile(), claims };
    const prepared = prepareIntro(jobSnapshotId, inputs, selection.budget, makeId);
    if (!prepared.ok) return { ok: false, reason: PREPARE_REFUSALS[prepared.reason] };

    const before = repos.applicationIntros.get(jobSnapshotId);
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
      .then((result) => commit(prepared.prepared, before, result))
      .then(settle, () => settle({ state: 'failed', failure: 'provider_error', problem: null }));
    return { ok: true, generation: RUNNING };
  }

  return {
    generate(jobSnapshotId) {
      // 同時按兩次：共用同一次啟動，不會送兩次
      let pending = starting.get(jobSnapshotId);
      if (!pending) {
        pending = begin(jobSnapshotId).finally(() => starting.delete(jobSnapshotId));
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
      };
    },

    async update(jobSnapshotId, text) {
      if (!repos.jobSnapshots.get(jobSnapshotId)) return { ok: false, reason: 'not_found' };
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
