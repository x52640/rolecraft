// Claude 連線檢查的排程（P1-T070）：helper 重開後不必手動按「重新檢查」。
// - ensureChecked：本程序還沒檢查過才自動做一次「只讀版本＋登入」的檢查（不重新驗證、不呼叫模型）；
//   設定頁讀狀態、選定模型用。並行的呼叫共用同一次；檢查本身丟錯不算檢查過，下次再試。
//   一般檢查（手動重新檢查或使用者發起的工作）進行中時不另外開（等它的結果）。
// - recheck：手動「重新檢查」。與使用者發起工作的一般檢查共用進行中的那一次（重新驗證期間
//   不另開檢查被閘門擋下；P1-T070 審查）。
// - prepareRun：使用者發起需要 Claude 的工作時用。目前狀態不是可用（還沒檢查、只做過自動檢查、
//   或上次完整檢查沒通過）就做一次一般檢查（D22／D24：沒有紀錄或未完成的版本照常自動重新驗證；
//   停用的版本不重試，只重讀版本與登入）。額度不足不重新檢查（R9）。
//   最多等 waitMs：重新驗證要幾分鐘，橋接請求只等 30 秒；等不到就回 false（檢查在背景繼續，
//   下次發起時接著等同一次），呼叫端回「檢查中，請稍後再試」。
// 先開始的檢查比後開始的晚結束：一般丟棄（不蓋掉較新的狀態）；例外是它通過、而較新的那次
// 是「純版本問題」（找得到 CLI、確認不了版本，且登入、方案、訂閱路線都沒有確定失敗；例如
// 重新驗證進行中被擋），這時採用通過的結果，不讓重新驗證白做。較新的那次只要有確定的登入或
// 訂閱路線失敗（例如登出），一律保留較新的結果。
import type { ClaudeCheck, ClaudeCheckOptions, ClaudeProbe } from './claude-probe.ts';
import type { ServiceStatus } from './service.ts';
import { claudeState } from './state.ts';

/** prepareRun 預設最多等多久（橋接預設逾時 30 秒，留餘裕給請求的其餘工作）。 */
export const CLAUDE_PREPARE_RUN_WAIT_MS = 20_000;

export interface ClaudeCheckScheduler {
  /** 不共用的檢查（重新啟用跑完後；要反映重新驗證之後的閘門） */
  refresh(options?: ClaudeCheckOptions): Promise<ServiceStatus>;
  /** 手動重新檢查：與進行中的一般檢查共用 */
  recheck(): Promise<ServiceStatus>;
  ensureChecked(): Promise<void>;
  /** true＝檢查已結束（或不需要）；false＝等超過 waitMs，檢查仍在背景進行 */
  prepareRun(waitMs?: number): Promise<boolean>;
  readonly checked: boolean;
}

/** 已經可以（或不該重新檢查）的狀態 */
const SETTLED: ReadonlySet<ServiceStatus['state']> = new Set(['available', 'quota_exhausted']);

export function createClaudeCheckScheduler(
  probe: Pick<ClaudeProbe, 'check'>,
  apply: (check: ClaudeCheck) => ServiceStatus,
  current: () => ServiceStatus,
): ClaudeCheckScheduler {
  let checked = false;
  let started = 0;
  let applied = 0;
  /** 最近一次套用的檢查（判斷晚到的通過結果能不能採用） */
  let last: ClaudeCheck | null = null;
  let auto: Promise<void> | null = null;
  /** 進行中的一般檢查（手動重新檢查與使用者發起的工作共用） */
  let general: Promise<ServiceStatus> | null = null;

  /** 純版本問題：找得到 CLI、確認不了版本，登入／方案／訂閱路線都沒有確定失敗。 */
  const versionOnly = (check: ClaudeCheck): boolean =>
    check.installed === 'passed' &&
    check.isolation !== 'passed' &&
    check.login !== 'failed' &&
    check.eligibility !== 'failed' &&
    check.subscriptionOnly !== 'failed';

  /** 晚到的較舊結果：自己通過、且較新的那次是純版本問題 → 採用。 */
  const rescues = (check: ClaudeCheck, options?: ClaudeCheckOptions): boolean =>
    options?.reverify !== false &&
    claudeState(check, false) === 'available' &&
    last !== null &&
    versionOnly(last);

  const refresh = async (options?: ClaudeCheckOptions): Promise<ServiceStatus> => {
    const seq = ++started;
    const check = await probe.check(options);
    if (seq < applied && !rescues(check, options)) return current();
    applied = Math.max(applied, seq);
    checked = true;
    last = check;
    return apply(check);
  };

  /** 丟錯吞掉（狀態維持原樣，下次再試）。 */
  const settle = (task: Promise<unknown>): Promise<void> =>
    task.then(
      () => undefined,
      () => undefined,
    );

  /** 一般檢查：進行中就共用那一次；錯誤照常傳給呼叫端（手動重新檢查回錯誤）。 */
  const recheck = (): Promise<ServiceStatus> => {
    if (!general) {
      const task = refresh().finally(() => {
        if (general === task) general = null;
      });
      general = task;
    }
    return general;
  };

  const ensureChecked = (): Promise<void> => {
    if (checked || general) return Promise.resolve();
    auto ??= settle(refresh({ reverify: false })).finally(() => {
      auto = null;
    });
    return auto;
  };

  const prepareRun = async (waitMs = CLAUDE_PREPARE_RUN_WAIT_MS): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), waitMs);
    });
    const within = (task: Promise<void>): Promise<boolean> =>
      Promise.race([task.then(() => true as const), timeout]);
    try {
      if (auto && !(await within(auto))) return false;
      if (checked && SETTLED.has(current().state)) return true;
      return await within(settle(recheck()));
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    refresh,
    recheck,
    ensureChecked,
    prepareRun,
    get checked() {
      return checked;
    },
  };
}
