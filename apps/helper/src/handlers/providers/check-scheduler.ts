// Claude 連線檢查的排程（P1-T070）：helper 重開後不必手動按「重新檢查」。
// - ensureChecked：本程序還沒檢查過才自動做一次「只讀版本＋登入」的檢查（不重新驗證、不呼叫模型）；
//   設定頁讀狀態、選定模型用。並行的呼叫共用同一次；檢查本身丟錯不算檢查過，下次再試。
//   使用者發起工作的完整檢查進行中時不另外開（等它的結果）。
// - prepareRun：使用者發起需要 Claude 的工作時用。目前狀態不是可用（還沒檢查、只做過自動檢查、
//   或上次完整檢查沒通過）就做一次一般檢查（D22／D24：沒有紀錄或未完成的版本照常自動重新驗證；
//   停用的版本不重試，只重讀版本與登入）。額度不足不重新檢查（R9）。
//   最多等 waitMs：重新驗證要幾分鐘，橋接請求只等 30 秒；等不到就回 false（檢查在背景繼續，
//   下次發起時接著等同一次），呼叫端回「檢查中，請稍後再試」。
// 先開始的檢查比後開始的晚結束：一般丟棄（不蓋掉較新的狀態）；例外是它通過、而較新的那次
// 只是確認不了版本（例如重新驗證進行中被擋），這時採用通過的結果，不讓重新驗證白做。
import type { ClaudeCheck, ClaudeCheckOptions, ClaudeProbe } from './claude-probe.ts';
import type { ServiceStatus } from './service.ts';
import { claudeState } from './state.ts';

/** prepareRun 預設最多等多久（橋接預設逾時 30 秒，留餘裕給請求的其餘工作）。 */
export const CLAUDE_PREPARE_RUN_WAIT_MS = 20_000;

export interface ClaudeCheckScheduler {
  /** 一般檢查（手動重新檢查、重新啟用後、選定被擋後） */
  refresh(options?: ClaudeCheckOptions): Promise<ServiceStatus>;
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
  let forRun: Promise<void> | null = null;

  /** 晚到的較舊結果：自己通過、且較新的那次找得到 CLI 卻確認不了版本 → 採用。 */
  const rescues = (check: ClaudeCheck, options?: ClaudeCheckOptions): boolean =>
    options?.reverify !== false &&
    claudeState(check, false) === 'available' &&
    last !== null &&
    last.installed === 'passed' &&
    last.isolation !== 'passed';

  const refresh = async (options?: ClaudeCheckOptions): Promise<ServiceStatus> => {
    const seq = ++started;
    const check = await probe.check(options);
    if (seq < applied && !rescues(check, options)) return current();
    applied = Math.max(applied, seq);
    checked = true;
    last = check;
    return apply(check);
  };

  /** 同一種檢查並行時共用同一次；丟錯吞掉（狀態維持原樣，下次再試）。 */
  const shared = (run: () => Promise<unknown>, clear: () => void): Promise<void> =>
    run()
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(clear);

  const ensureChecked = (): Promise<void> => {
    if (checked || forRun) return Promise.resolve();
    auto ??= shared(
      () => refresh({ reverify: false }),
      () => {
        auto = null;
      },
    );
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
      forRun ??= shared(
        () => refresh(),
        () => {
          forRun = null;
        },
      );
      return await within(forRun);
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    refresh,
    ensureChecked,
    prepareRun,
    get checked() {
      return checked;
    },
  };
}
