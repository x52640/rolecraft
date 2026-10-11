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

/**
 * 單一驗證槽位的硬期限（P1-T044 對抗驗證）。正常情況下 probe 自己就有逾時（版本讀取、重新驗證每次
 * 啟動、模型短驗證），最壞約十幾分鐘（自動重新驗證 6 次啟動）；這裡是最後防線：超過就釋放槽位、
 * 回「無法確認」，之後那次驗證的結果一律丟棄，不寫狀態、不記選定。
 */
export const CLAUDE_VERIFY_SLOT_DEADLINE_MS = 20 * 60 * 1000;

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

  const refresh = async (): Promise<ServiceStatus> => {
    const check = await probe.check();
    // 重新檢查不呼叫模型，無法得知額度；清掉舊的額度不足標記，下次執行再由工具回報。
    return update('claude', {
      state: claudeState(check, false),
      login: check.login,
      eligibility: check.eligibility,
      subscriptionOnly: check.subscriptionOnly,
      checkedAt: check.checkedAt,
    });
  };

  // Claude 同一時間只跑一個短驗證：被擋時的自動重新檢查會覆寫狀態，
  // 兩個候選並行時可能蓋掉另一個剛設的 quota_exhausted（P1-T044）。
  let inFlight: { readonly candidateId: string; readonly task: Promise<SelectResult> } | null =
    null;

  const verify = async (entry: CandidateEntry, stale: () => boolean): Promise<SelectResult> => {
    const result = await probe.verifyModel(entry.model);
    // 槽位已因硬期限釋放：結果過期，不寫任何狀態（避免蓋掉之後其他候選的結果）。
    if (stale()) return { kind: 'verified', verification: 'unknown' };
    if (result.record) lastRunCheck = result.record;
    if (result.quotaExhausted) update('claude', { state: 'quota_exhausted' });
    if (result.blocked) {
      // 執行前被擋：先前的「可用」已不可信。重新檢查更新狀態；檢查仍說可用（例如閘門暫時擋下）也不保留可用。
      const fresh = await refresh().catch(() => null);
      if (!fresh || fresh.state === 'available') {
        update('claude', { state: 'eligibility_unknown', checkedAt: new Date().toISOString() });
      }
    }
    // 只有短驗證通過才記為選定；失敗或無法確認時保留原本的選定。
    if (result.verification === 'passed') {
      update('claude', { selectedCandidateId: entry.candidate.candidateId });
    }
    return { kind: 'verified', verification: result.verification };
  };

  return {
    get lastRunCheck() {
      return lastRunCheck;
    },

    status() {
      return Promise.resolve(ALL_SERVICES.map(current));
    },

    recheck(service) {
      // Codex、Antigravity 首版「尚未支援」：不檢查、不啟動任何程式。
      if (service !== 'claude') return Promise.resolve(current(service));
      return refresh();
    },

    listCandidates(service) {
      return Promise.resolve(candidatesOf(service).map((entry) => entry.candidate));
    },

    selectCandidate(service, candidateId): Promise<SelectResult> {
      const entry = candidatesOf(service).find((e) => e.candidate.candidateId === candidateId);
      if (!entry) return Promise.resolve({ kind: 'unknown_candidate' });
      // 同一候選進行中的驗證合併成一次（不重複花模型呼叫）；其他候選在進行中一律 not_available。
      if (inFlight) {
        return inFlight.candidateId === entry.candidate.candidateId
          ? inFlight.task
          : Promise.resolve({ kind: 'not_available' });
      }
      // 不是「可用」就不呼叫模型（未檢查、被擋、額度不足等）。
      if (current('claude').state !== 'available') {
        return Promise.resolve({ kind: 'not_available' });
      }
      // 槽位必定釋放：verify 結束或硬期限到（先到者），不會因 probe 卡住而永遠回 not_available。
      let released = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<SelectResult>((resolve) => {
        timer = setTimeout(
          () => resolve({ kind: 'verified', verification: 'unknown' }),
          CLAUDE_VERIFY_SLOT_DEADLINE_MS,
        );
      });
      const task = Promise.race([verify(entry, () => released), deadline]).finally(() => {
        released = true;
        clearTimeout(timer);
        if (inFlight?.task === task) inFlight = null;
      });
      inFlight = { candidateId: entry.candidate.candidateId, task };
      return task;
    },
  };
}
