// resume.generate 的服務（P1-T025）：只用已確認的職缺快照（R10），經 P1-T024 的 generation runner 執行（R9）。
// - 送出前先在這裡跑一次 prepareGeneration（快照、Profile、可用事實項、預算），不成立就直接回原因、不建工作。
// - 結果與工作狀態在同一交易寫入；pipeline 的段落位置對應成 contracts ResumeSection.placement（P1-T040），
//   對應不到的段落不帶 placement（匯出前檢查會擋）；decision 一律從 pending 開始，保留 rationale。
// - 執行結束為 blocked／not_sent 或丟出例外時，工作不會停在 running：以 domain restoreWorkRun
//   改為已暫停，等使用者主動續跑（D21）。工作狀態查詢與續跑沒有橋接操作，本 Task 不做。
import type { DatabaseSync } from 'node:sqlite';

import type {
  JobSnapshot,
  Profile,
  Provider,
  ResumeSection,
  ResumeVersion,
  SectionPlacement,
  WorkJob,
} from '@rolecraft/contracts';
import { createWorkRun, restoreWorkRun, type InputBudget } from '@rolecraft/domain';
import {
  createGenerationRunner,
  planGeneration,
  prepareGeneration,
  type GenerationInputs,
  type GenerationPrepareFailure,
  type GenerationResult,
  type SectionPlacement as PipelinePlacement,
} from '@rolecraft/pipeline';
import type { RunOutcome } from '@rolecraft/providers';
import { newId as storageId, transaction, type Repositories } from '@rolecraft/storage';

import type { ClaimGate } from '../sources/claim-gate.ts';
import type { ResumeFailure, ResumeFailureReason } from './service.ts';

/**
 * 選定的服務、模型（只能是 helper 自己的候選常數）、輸入預算（R8）與執行端。
 * execute 必須經 runWithSubscriptionCheck（Claude 一律經 helperClaudeDeps）。
 */
export interface GenerationSelection {
  readonly provider: Provider;
  readonly model: string;
  readonly budget: InputBudget;
  execute(request: { prompt: string; signal: AbortSignal }): Promise<RunOutcome>;
}

export interface GenerationEngine {
  /** 目前選定且可用的模型；沒有就 null（不送出） */
  select(): Promise<GenerationSelection | null>;
  /** 測試用：重試等待；預設 setTimeout（可被取消） */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

export interface GenerationDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly engine: GenerationEngine;
  /** 測試用：背景工作結束時通知 */
  readonly onSettled?: (jobSnapshotId: string) => void;
  /** 引用來源已撤銷或不在授權集合的事實項當來源已移除（P1-T060）；沒給就不套 */
  readonly gate?: ClaimGate | null;
}

const PREPARE_REASONS: Record<GenerationPrepareFailure, ResumeFailureReason> = {
  snapshot_missing: 'snapshot_not_found',
  snapshot_not_confirmed: 'snapshot_not_confirmed',
  snapshot_changed: 'snapshot_not_confirmed',
  profile_not_confirmed: 'profile_not_confirmed',
  no_usable_claims: 'no_usable_claims',
  over_budget: 'over_budget',
};

/** pipeline 的段落位置 → contracts 段落歸屬（只用來比對；印出的公司、職稱、日期取自 Profile）。 */
export function toPlacement(placement: PipelinePlacement): SectionPlacement {
  switch (placement.kind) {
    case 'summary':
      return { group: 'summary' };
    case 'project':
      return { group: 'project' };
    case 'experience':
      return {
        group: 'experience',
        company: placement.company,
        title: placement.title,
        startDate: placement.startDate,
      };
  }
}

/** 生成結果 → 要存的履歷版本：補上段落歸屬，decision 從 pending 開始。 */
export function toStoredVersion(result: GenerationResult): ResumeVersion {
  const bySection = new Map(result.placements.map((p) => [p.sectionId, p.placement]));
  const sections = result.resumeVersion.sections.map((section): ResumeSection => {
    const placement = bySection.get(section.id);
    const rest: ResumeSection = { ...section };
    delete rest.placement;
    return {
      ...rest,
      ...(placement === undefined ? {} : { placement: toPlacement(placement) }),
      decision: 'pending',
    };
  });
  return { ...result.resumeVersion, sections };
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

export function createGeneration(deps: GenerationDeps) {
  const { db, repos, engine } = deps;
  const running = new Set<string>();

  const loadInputs = (jobSnapshotId: string): GenerationInputs => {
    const profiles = repos.profiles.list();
    const profile: Profile | null = profiles.length === 1 ? (profiles[0] ?? null) : null;
    const jobSnapshot: JobSnapshot | null = repos.jobSnapshots.get(jobSnapshotId);
    const claims = repos.claims.list();
    return { profile, jobSnapshot, claims: deps.gate ? deps.gate.apply(claims) : claims };
  };

  const failure = (reason: ResumeFailureReason): ResumeFailure => ({ ok: false, reason });

  return async (
    jobSnapshotId: string,
  ): Promise<{ ok: true; workJobId: string } | ResumeFailure> => {
    const snapshot = repos.jobSnapshots.get(jobSnapshotId);
    if (snapshot === null) return failure('snapshot_not_found');
    if (running.has(jobSnapshotId)) return failure('already_running');
    const selection = await engine.select();
    if (selection === null) return failure('no_model');
    await deps.gate?.refresh();
    const planned = planGeneration({
      jobSnapshot: snapshot,
      budget: selection.budget,
      newId: storageId,
    });
    if (!planned.ok) return failure(PREPARE_REASONS[planned.reason]);
    const { plan } = planned;
    // 先在這裡檢查一次；runner 每次送出前還會再重讀、再檢查。
    const pre = prepareGeneration(plan, loadInputs(jobSnapshotId), storageId);
    if (!pre.ok) return failure(PREPARE_REASONS[pre.reason]);
    if (running.has(jobSnapshotId)) return failure('already_running');

    const initial = createWorkRun(plan.jobId, [plan.unitId]);
    repos.workJobs.save(initial.job);
    const controller = new AbortController();
    const runner = createGenerationRunner(plan, initial, {
      provider: selection.provider,
      model: selection.model,
      execute: ({ prompt, signal }) => selection.execute({ prompt, signal }),
      cancellation: {
        signal: controller.signal,
        abort: () => controller.abort(),
        aborted: () => controller.signal.aborted,
      },
      loadInputs: async () => {
        await deps.gate?.refresh();
        return loadInputs(jobSnapshotId);
      },
      commitUnit: ({ job, written }) => {
        transaction(db, () => {
          repos.resumeVersions.save(toStoredVersion(written.output));
          repos.workJobs.save(job);
        });
        return Promise.resolve();
      },
      saveJob: (job) => {
        repos.workJobs.save(job);
        return Promise.resolve();
      },
      recordRunCheck: (record) => {
        repos.runCheckRecords.append(record);
        return Promise.resolve();
      },
      newId: storageId,
      now: () => Date.now(),
      sleep: (ms, signal) => (engine.sleep ?? abortableSleep)(ms, signal),
    });

    /** 沒跑完就結束（blocked、not_sent、例外）：改為已暫停，等使用者續跑（D21）。 */
    const pauseIfRunning = (job: WorkJob) => {
      if (job.status !== 'running') return;
      try {
        repos.workJobs.save(restoreWorkRun(job).job);
      } catch {
        // 寫不進去：helper 下次啟動時 pauseInterruptedJobs 會再處理
      }
    };
    running.add(jobSnapshotId);
    void runner
      .run()
      .then(
        (report) => pauseIfRunning(report.job),
        () => pauseIfRunning(runner.current().job),
      )
      .finally(() => {
        running.delete(jobSnapshotId);
        deps.onSettled?.(jobSnapshotId);
      });
    return { ok: true, workJobId: plan.jobId };
  };
}
