// Claude 連線檢查的排程（P1-T070）：helper 重開後不必手動按「重新檢查」。
// - ensureChecked：本程序還沒檢查過才自動做一次「只讀版本＋登入」的檢查（不重新驗證、不呼叫模型）；
//   設定頁讀狀態、選定模型用。並行的呼叫共用同一次；檢查本身丟錯不算檢查過，下次再試。
// - prepareRun：使用者發起需要 Claude 的工作時用。本程序還沒檢查過，或上次只是自動檢查且結果不可用，
//   就做一次一般檢查（D22／D24：沒有紀錄或未完成的版本照常自動重新驗證；停用的版本不重試）。
// 先開始的檢查若比後開始的晚結束，結果丟棄（不蓋掉較新的狀態）。
import type { ClaudeCheck, ClaudeCheckOptions, ClaudeProbe } from './claude-probe.ts';
import type { ServiceStatus } from './service.ts';

export interface ClaudeCheckScheduler {
  /** 一般檢查（手動重新檢查、重新啟用後、選定被擋後） */
  refresh(options?: ClaudeCheckOptions): Promise<ServiceStatus>;
  ensureChecked(): Promise<void>;
  prepareRun(): Promise<void>;
  readonly checked: boolean;
}

export function createClaudeCheckScheduler(
  probe: Pick<ClaudeProbe, 'check'>,
  apply: (check: ClaudeCheck) => ServiceStatus,
  current: () => ServiceStatus,
): ClaudeCheckScheduler {
  let checked = false;
  /** 最近一次套用的是「只讀版本」的自動檢查 */
  let observeOnly = false;
  let started = 0;
  let applied = 0;
  let auto: Promise<void> | null = null;
  let forRun: Promise<void> | null = null;

  const refresh = async (options?: ClaudeCheckOptions): Promise<ServiceStatus> => {
    const seq = ++started;
    const check = await probe.check(options);
    if (seq < applied) return current();
    applied = seq;
    checked = true;
    observeOnly = options?.reverify === false;
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
    if (checked) return Promise.resolve();
    auto ??= shared(
      () => refresh({ reverify: false }),
      () => {
        auto = null;
      },
    );
    return auto;
  };

  const prepareRun = async (): Promise<void> => {
    if (auto) await auto;
    if (checked && !(observeOnly && current().state !== 'available')) return;
    forRun ??= shared(
      () => refresh(),
      () => {
        forRun = null;
      },
    );
    await forRun;
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
