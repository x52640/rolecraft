// providers.* 服務實作（P1-T030）。狀態、候選對照與選定結果目前只存在記憶體（storage 尚未接上）。
// 候選 ID 由這裡配發（隨機不透明字串）；選定時只拿 ID 查自己的對照表，
// 查不到一律 unknown_candidate（handler 回 invalid_request），請求字串永遠不會成為 CLI 參數（R7）。
import { randomUUID } from 'node:crypto';

import type { Provider, RunCheckRecord } from '@rolecraft/contracts';

import { type ClaudeProbe, type ClaudeProbeOptions, createClaudeProbe } from './claude-probe.ts';
import type { ProvidersService, SelectResult, ServiceCandidate, ServiceStatus } from './service.ts';
import { ALL_SERVICES, claudeState, initialStatus } from './state.ts';

export interface ProvidersServiceOptions extends ClaudeProbeOptions {
  /** 測試用：替換 Claude 檢查 */
  readonly claudeProbe?: ClaudeProbe;
  /** 測試用：候選 ID 產生器（預設隨機） */
  readonly newCandidateId?: () => string;
}

/** 候選顯示名稱；別名本身就是官方 CLI 的模型別名。 */
const CLAUDE_LABELS: Readonly<Record<string, string>> = {
  haiku: 'Claude Haiku',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
  fable: 'Claude Fable',
};

interface CandidateEntry {
  readonly candidate: ServiceCandidate;
  /** 只來自 helper 自己的常數清單 */
  readonly model: string;
}

export interface ProvidersServiceImpl extends Required<ProvidersService> {
  /** 最近一次模型短驗證的 R6 確認紀錄（S9-2 證據；待接 storage 後改為保存） */
  readonly lastRunCheck: RunCheckRecord | null;
}

export function createProvidersService(
  options: ProvidersServiceOptions = {},
): ProvidersServiceImpl {
  const probe = options.claudeProbe ?? createClaudeProbe(options);
  const newCandidateId = options.newCandidateId ?? (() => `c${randomUUID().replaceAll('-', '')}`);
  const statuses = new Map<Provider, ServiceStatus>(
    ALL_SERVICES.map((service) => [service, initialStatus(service)]),
  );
  let lastRunCheck: RunCheckRecord | null = null;

  // 配發一次、同一程序內穩定；只有 Claude 有候選。
  const claudeCandidates: readonly CandidateEntry[] = probe.candidates.map((model) => ({
    candidate: { candidateId: newCandidateId(), label: CLAUDE_LABELS[model] ?? model },
    model,
  }));
  const candidatesOf = (service: Provider): readonly CandidateEntry[] =>
    service === 'claude' ? claudeCandidates : [];

  const current = (service: Provider): ServiceStatus =>
    statuses.get(service) ?? initialStatus(service);

  const update = (service: Provider, patch: Partial<ServiceStatus>): ServiceStatus => {
    const next = { ...current(service), ...patch };
    statuses.set(service, next);
    return next;
  };

  return {
    get lastRunCheck() {
      return lastRunCheck;
    },

    status() {
      return Promise.resolve(ALL_SERVICES.map(current));
    },

    async recheck(service) {
      // Codex、Antigravity 首版「尚未支援」：不檢查、不啟動任何程式。
      if (service !== 'claude') return current(service);
      const check = await probe.check();
      // 重新檢查不呼叫模型，無法得知額度；清掉舊的額度不足標記，下次執行再由工具回報。
      return update('claude', {
        state: claudeState(check, false),
        login: check.login,
        eligibility: check.eligibility,
        subscriptionOnly: check.subscriptionOnly,
        checkedAt: check.checkedAt,
      });
    },

    listCandidates(service) {
      return Promise.resolve(candidatesOf(service).map((entry) => entry.candidate));
    },

    async selectCandidate(service, candidateId): Promise<SelectResult> {
      const entry = candidatesOf(service).find((e) => e.candidate.candidateId === candidateId);
      if (!entry) return { kind: 'unknown_candidate' };
      const result = await probe.verifyModel(entry.model);
      if (result.record) lastRunCheck = result.record;
      if (result.quotaExhausted) update('claude', { state: 'quota_exhausted' });
      // 只有短驗證通過才記為選定；失敗或無法確認時保留原本的選定。
      if (result.verification === 'passed') {
        update('claude', { selectedCandidateId: entry.candidate.candidateId });
      }
      return { kind: 'verified', verification: result.verification };
    },
  };
}
