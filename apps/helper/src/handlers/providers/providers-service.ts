// providers.* 服務實作（P1-T030）。有資料區時選定的模型、連接狀態、R6 確認紀錄寫進資料區（P1-T058）；
// 重啟後不沿用舊的可用，選定的模型以模型別名對回這次配發的候選。本程序第一次需要 Claude 狀態時
// （設定頁讀狀態、選定模型、生成端解析模型）自動做一次連線檢查，不呼叫模型（P1-T070）。
// 候選 ID 由這裡配發（隨機不透明字串）；選定時只拿 ID 查自己的對照表，
// 查不到一律 unknown_candidate（handler 回 invalid_request），請求字串永遠不會成為 CLI 參數（R7）。
import { randomUUID } from 'node:crypto';

import type { Provider, RunCheckRecord } from '@rolecraft/contracts';
import type { ClaudeService } from '@rolecraft/providers';

import {
  type ClaudeCheck,
  type ClaudeProbe,
  type ClaudeProbeOptions,
  createClaudeProbe,
  createHelperClaudeService,
} from './claude-probe.ts';
import { createClaudeReverifyRunner } from './claude-reverify.ts';
import { createClaudeCheckScheduler } from './check-scheduler.ts';
import type { ProvidersStore } from './persistence.ts';
import type { ProvidersService, SelectResult, ServiceCandidate, ServiceStatus } from './service.ts';
import { ALL_SERVICES, claudeState, initialStatus } from './state.ts';

export interface ProvidersServiceOptions extends ClaudeProbeOptions {
  /** 測試用：替換 Claude 檢查 */
  readonly claudeProbe?: ClaudeProbe;
  /** 測試用：候選 ID 產生器（預設隨機） */
  readonly newCandidateId?: () => string;
  /** 資料區保存（P1-T058）；省略時全在記憶體（未設資料區） */
  readonly store?: ProvidersStore;
  /** 測試用：prepareRun 最多等多久（預設 CLAUDE_PREPARE_RUN_WAIT_MS） */
  readonly prepareRunWaitMs?: number;
}

/** providers 服務用的 Claude 服務，供生成端共用同一個版本閘門（claudeServiceOf）。 */
const sharedClaude = new WeakMap<ProvidersService, ClaudeService>();

/** 取得 providers 服務檢查與短驗證所用的 Claude 服務；測試替換了 probe 時沒有。 */
export function claudeServiceOf(providers: ProvidersService): ClaudeService | undefined {
  return sharedClaude.get(providers);
}

/** 連接狀態的保存失敗不影響記憶體中的狀態（重啟後本來就要重新檢查；下次寫入再試）。 */
function persist(write: () => void): void {
  try {
    write();
  } catch {
    // 資料區寫入失敗：記憶體狀態照常，不讓狀態查詢因此失敗。
  }
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
  /** 最近一次模型短驗證的 R6 確認紀錄（S9-2 證據；有資料區時另寫進 run_check_records） */
  readonly lastRunCheck: RunCheckRecord | null;
  /** 進行中的背景重新啟用（測試等它結束用） */
  readonly reverifyTask: Promise<void> | null;
}

export function createProvidersService(
  options: ProvidersServiceOptions = {},
): ProvidersServiceImpl {
  const { store } = options;
  const claudeService = options.claudeProbe
    ? options.service
    : (options.service ?? createHelperClaudeService());
  const probe =
    options.claudeProbe ??
    createClaudeProbe({ ...options, ...(claudeService && { service: claudeService }) });
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
  // 重啟還原：只還原選定的模型（對不上目前候選就不選）；狀態維持初始的「需重新檢查」。
  const savedModel = store?.loadSelectedModel('claude') ?? null;
  const restored = claudeCandidates.find((entry) => entry.model === savedModel);
  if (restored) {
    statuses.set('claude', {
      ...initialStatus('claude'),
      selectedCandidateId: restored.candidate.candidateId,
    });
  }
  /** 這個程序內短驗證通過過的模型（provider_connections.availableModels） */
  const verifiedModels = new Set<string>();

  // 重新啟用（D24）：背景重跑注入測試，跑完重新檢查；狀態上疊 versionCheck／lastReverify。
  const reverify = createClaudeReverifyRunner(probe, () => checks.refresh());

  const current = (service: Provider): ServiceStatus => {
    const status = statuses.get(service) ?? initialStatus(service);
    return service === 'claude' ? reverify.decorate(status) : status;
  };

  const update = (service: Provider, patch: Partial<ServiceStatus>): ServiceStatus => {
    const next = { ...current(service), ...patch };
    statuses.set(service, next);
    return next;
  };

  // 重新檢查不呼叫模型，無法得知額度；清掉舊的額度不足標記，下次執行再由工具回報。
  const saveConnection = (status: ServiceStatus): void => {
    const { checkedAt } = status;
    if (!store || checkedAt === null) return;
    const { service: provider, login, eligibility, subscriptionOnly } = status;
    const availableModels = [...verifiedModels];
    persist(() =>
      store.saveConnection({
        provider,
        login,
        eligibility,
        subscriptionOnly,
        availableModels,
        checkedAt,
      }),
    );
  };

  const applyCheck = (check: ClaudeCheck): ServiceStatus => {
    reverify.noteCheck(check.versionIssue ?? null);
    const next = update('claude', {
      state: claudeState(check, false),
      login: check.login,
      eligibility: check.eligibility,
      subscriptionOnly: check.subscriptionOnly,
      checkedAt: check.checkedAt,
    });
    saveConnection(next);
    return next;
  };

  // 自動連線檢查（P1-T070）：設定頁讀狀態、選定模型前只讀版本＋登入；使用者發起工作前照 D22／D24。
  const checks = createClaudeCheckScheduler(probe, applyCheck, () => current('claude'));

  // Claude 同一時間只跑一個短驗證：被擋時的自動重新檢查會覆寫狀態，
  // 兩個候選並行時可能蓋掉另一個剛設的 quota_exhausted（P1-T044）。
  let inFlight: { readonly candidateId: string; readonly task: Promise<SelectResult> } | null =
    null;

  const verify = async (entry: CandidateEntry, stale: () => boolean): Promise<SelectResult> => {
    const result = await probe.verifyModel(entry.model);
    // 槽位已因硬期限釋放：結果過期，不寫任何狀態（避免蓋掉之後其他候選的結果）。
    if (stale()) return { kind: 'verified', verification: 'unknown' };
    const { record } = result;
    // R6 確認紀錄寫不進資料區：這次驗證視同失敗、不記選定（與 draft-job、generation 一致）。
    let verification = result.verification;
    if (record) {
      lastRunCheck = record;
      try {
        store?.appendRunCheck(record);
      } catch {
        verification = 'failed';
      }
    }
    if (result.quotaExhausted) update('claude', { state: 'quota_exhausted' });
    if (result.blocked) {
      // 執行前被擋：先前的「可用」已不可信。重新檢查更新狀態；檢查仍說可用（例如閘門暫時擋下）也不保留可用。
      const check = await probe.check().catch(() => null);
      // 重新檢查可能卡過硬期限（P1-T055）：期間其他候選已寫入狀態，過期就整次不寫。
      // 以下到 return 之間沒有 await，這次檢查之後的寫入都在同一個未過期的時點完成。
      if (stale()) return { kind: 'verified', verification: 'unknown' };
      const fresh = check ? applyCheck(check) : null;
      if (!fresh || fresh.state === 'available') {
        update('claude', { state: 'eligibility_unknown', checkedAt: new Date().toISOString() });
      }
    }
    // 只有短驗證通過才記為選定；失敗或無法確認時保留原本的選定。
    // 選定要先寫進資料區才生效：寫不進去就丟錯（handler 回錯誤），記憶體保留原本的選定。
    if (verification === 'passed') {
      store?.saveSelectedModel('claude', entry.model);
      verifiedModels.add(entry.model);
      saveConnection(update('claude', { selectedCandidateId: entry.candidate.candidateId }));
    }
    return { kind: 'verified', verification };
  };

  const impl: ProvidersServiceImpl = {
    get lastRunCheck() {
      return lastRunCheck;
    },

    get reverifyTask() {
      return reverify.task;
    },

    async prepareRun(service) {
      // 沒有選定模型就不做完整檢查（可能重新驗證、呼叫模型），由呼叫端回「尚未選定模型」。
      if (service !== 'claude' || current('claude').selectedCandidateId === null) {
        return { status: current(service), checking: false };
      }
      const done = await checks.prepareRun(options.prepareRunWaitMs);
      return { status: current(service), checking: !done };
    },

    reverifyClaude() {
      const started = reverify.start();
      return Promise.resolve({ started, status: current('claude') });
    },

    async status() {
      await checks.ensureChecked();
      return ALL_SERVICES.map(current);
    },

    recheck(service) {
      // Codex、Antigravity 首版「尚未支援」：不檢查、不啟動任何程式。
      if (service !== 'claude') return Promise.resolve(current(service));
      // 與使用者發起工作的一般檢查共用進行中的那一次（P1-T070）。
      return checks.recheck();
    },

    listCandidates(service) {
      return Promise.resolve(candidatesOf(service).map((entry) => entry.candidate));
    },

    selectCandidate(service, candidateId): Promise<SelectResult> {
      if (!checks.checked) return checks.ensureChecked().then(() => select(service, candidateId));
      return select(service, candidateId);
    },
  };

  function select(service: Provider, candidateId: string): Promise<SelectResult> {
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
  }
  if (claudeService) sharedClaude.set(impl, claudeService);
  return impl;
}
