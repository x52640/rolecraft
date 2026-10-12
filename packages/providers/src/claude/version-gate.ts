import type { SupportStatus } from '../core/adapter.ts';
import { CLAUDE_VERIFIED_VERSION } from './constants.ts';

/**
 * Claude CLI 版本閘門（plan.md D22、D24；P1-T039、P1-T062）。每個版本以最後一筆紀錄為準：
 * - verified：接受。failed：只停用這個版本（目前偵測到的是它才停用），不自動重試；
 *   使用者在設定頁「重新啟用」才重跑注入測試。incomplete（暫定紀錄，重新驗證中途被打斷）：
 *   不算失敗，狀態為「需要重新驗證」，下次使用者發起需要 Claude 的工作時重跑。
 * - P1-T058 舊格式的暫定紀錄（outcome=failed、reason=重新驗證未完成、沒有案例）讀成 incomplete。
 * 「重新驗證」與「一般執行」互斥：重新驗證中拒絕一般執行與另一個重新驗證；一般執行進行中不開始重新驗證。
 * 保存位置由呼叫端注入（ClaudeVersionStore）；讀取失敗或格式不合法 → 只接受 ADR-0002 驗證版本，
 * 且不做自動重新驗證（不知道先前是否失敗過）。
 */

export interface ReverifyCaseResult {
  /** 案例代號（例：no-tool-calls、api-key-source） */
  readonly id: string;
  readonly passed: boolean;
  /** 判定依據；不含模型回覆原文 */
  readonly detail: string;
}

export interface ClaudeVersionRecord {
  readonly version: string;
  /** incomplete＝呼叫模型前先存的暫定紀錄（之後沒有結果就是中途被打斷） */
  readonly outcome: 'verified' | 'failed' | 'incomplete';
  /** ISO 時間 */
  readonly verifiedAt: string;
  readonly cases: readonly ReverifyCaseResult[];
  /** 這次重新驗證實際呼叫模型的次數 */
  readonly modelCalls: number;
  /** 失敗原因（outcome=failed 時）；暫定紀錄為 PROVISIONAL_REASON */
  readonly reason?: string;
}

/** 已驗證版本清單的保存介面；儲存位置由呼叫端決定（helper 接資料區，P1-T058）。 */
export interface ClaudeVersionStore {
  load(): Promise<readonly ClaudeVersionRecord[]>;
  save(record: ClaudeVersionRecord): Promise<void>;
}

/** 依新增順序保存 JSON 字串的後端（例如 storage 的 claude_version_records）。 */
export interface ClaudeVersionRows {
  list(): readonly string[];
  append(json: string, recordedAt: string): void;
}

/**
 * 以 JSON 列實作 ClaudeVersionStore（P1-T058）。原樣保存閘門交來的每一筆（含暫定紀錄），
 * 版本是否接受仍由閘門決定：只有 outcome=verified 的版本會被接受。
 * 任一列不是合法 JSON → load 拋錯，閘門視為讀取失敗（只接受 ADR-0002 版本、不自動重新驗證）。
 */
export function jsonClaudeVersionStore(rows: ClaudeVersionRows): ClaudeVersionStore {
  return {
    load: () =>
      Promise.resolve().then(() =>
        rows.list().map((json) => JSON.parse(json) as ClaudeVersionRecord),
      ),
    save: (record) =>
      Promise.resolve().then(() => rows.append(JSON.stringify(record), new Date().toISOString())),
  };
}

export type GateState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'reverifying'; readonly version: string }
  /** 目前偵測到的版本最後一筆是 failed */
  | { readonly kind: 'disabled'; readonly version: string; readonly reason: string }
  /** 目前偵測到的版本最後一筆是 incomplete（上次重新驗證被打斷） */
  | { readonly kind: 'needs_reverify'; readonly version: string; readonly reason: string };

/** 某版本依最後一筆紀錄的狀態。 */
export type VersionStatus =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'incomplete'; readonly reason: string }
  | { readonly kind: 'unknown' };

const OUTCOMES: readonly unknown[] = ['verified', 'failed', 'incomplete'];

const isRecord = (value: unknown): value is ClaudeVersionRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['version'] === 'string' &&
    r['version'] !== '' &&
    OUTCOMES.includes(r['outcome']) &&
    typeof r['verifiedAt'] === 'string' &&
    Array.isArray(r['cases']) &&
    typeof r['modelCalls'] === 'number'
  );
};

export const PROVISIONAL_REASON = '重新驗證未完成';

export const REVERIFYING_REASON = 'Claude CLI 版本已變更，正在自動重新驗證；期間不執行任何工作';

/** P1-T058 存的暫定紀錄是 outcome=failed＋PROVISIONAL_REASON＋沒有案例：讀成 incomplete。 */
const normalize = (record: ClaudeVersionRecord): ClaudeVersionRecord =>
  record.outcome === 'failed' && record.reason === PROVISIONAL_REASON && record.cases.length === 0
    ? { ...record, outcome: 'incomplete' }
    : record;

export class ClaudeVersionGate {
  /** 每個版本最後一筆（已讀的保存紀錄＋這個程序內的結果，含寫不進去而只在記憶體的失敗） */
  private readonly latest = new Map<string, ClaudeVersionRecord>();
  private reverifying: string | null = null;
  /** 最近一次讀到的 CLI 版本（observe）；停用與否只看它 */
  private current: string | null = null;
  private inFlight = 0;
  private loaded: Promise<boolean> | null = null;
  private storeUsable = false;

  private readonly store: ClaudeVersionStore | null;

  constructor(store: ClaudeVersionStore | null = null) {
    this.store = store;
  }

  get state(): GateState {
    if (this.reverifying !== null) return { kind: 'reverifying', version: this.reverifying };
    if (this.current === null) return { kind: 'ready' };
    const status = this.statusOf(this.current);
    if (status.kind === 'failed') {
      return { kind: 'disabled', version: this.current, reason: status.reason };
    }
    if (status.kind === 'incomplete') {
      return { kind: 'needs_reverify', version: this.current, reason: status.reason };
    }
    return { kind: 'ready' };
  }

  /** 是否已驗證（ADR-0002 驗證版本，或該版本最後一筆是 verified）。 */
  readonly isAccepted = (version: string): boolean =>
    version === CLAUDE_VERIFIED_VERSION || this.latest.get(version)?.outcome === 'verified';

  /** 某版本的狀態（只看紀錄，不呼叫任何程式）。 */
  statusOf(version: string): VersionStatus {
    if (this.isAccepted(version)) return { kind: 'accepted' };
    const record = this.latest.get(version);
    if (!record) return { kind: 'unknown' };
    if (record.outcome === 'incomplete') {
      return {
        kind: 'incomplete',
        reason: `Claude CLI ${version} 的重新驗證上次沒有完成（${record.verifiedAt} 開始，可能中途被關閉）；需要重新驗證，下次使用 Claude 時會自動重跑`,
      };
    }
    return {
      kind: 'failed',
      reason: `Claude CLI ${version} 重新驗證失敗（${record.verifiedAt}）：${record.reason ?? '未通過'}；已停用這個版本，不自動重試，可在設定頁重新啟用`,
    };
  }

  /** 記下這次讀到的 CLI 版本（停用、需要重新驗證都只針對目前版本）。 */
  observe(version: string): void {
    this.current = version;
  }

  /** 讀取保存清單（只讀一次）。回傳 false 表示讀取失敗，不可做自動重新驗證。 */
  load(): Promise<boolean> {
    this.loaded ??= this.readStore();
    return this.loaded;
  }

  private async readStore(): Promise<boolean> {
    if (!this.store) return false;
    try {
      const records: unknown = await this.store.load();
      if (!Array.isArray(records) || !records.every(isRecord)) return false;
      // 同一版本以最後一筆為準（暫定紀錄之後的 verified／failed 會覆蓋它）。
      for (const record of records) this.apply(record);
      this.storeUsable = true;
      return true;
    } catch {
      return false;
    }
  }

  /** 可以自動重新驗證（有保存介面且讀取成功）。 */
  get canReverify(): boolean {
    return this.storeUsable;
  }

  private apply(record: ClaudeVersionRecord): void {
    this.latest.set(record.version, normalize(record));
  }

  /** 給 ProviderAdapter.support 用：目前版本停用、需要重新驗證、或重新驗證中都是「無法確認」。 */
  support(): SupportStatus {
    const s = this.state;
    if (s.kind === 'disabled' || s.kind === 'needs_reverify') {
      return { state: 'cannot_confirm', reason: s.reason };
    }
    if (s.kind === 'reverifying') return { state: 'cannot_confirm', reason: REVERIFYING_REASON };
    return { state: 'supported' };
  }

  /** 一般執行開始；重新驗證中、目前版本停用或需要重新驗證 → null（拒絕）。成功時回傳釋放函式。 */
  enterRun(): (() => void) | null {
    if (this.state.kind !== 'ready') return null;
    this.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
    };
  }

  /**
   * 開始重新驗證；已有重新驗證、有一般執行進行中、或保存清單不可用 → false。
   * 要不要對這個版本重新驗證（例如 failed 只能由使用者重新啟用）由呼叫端決定。
   */
  beginReverify(version: string): boolean {
    if (this.reverifying !== null || this.inFlight > 0 || !this.storeUsable) return false;
    this.reverifying = version;
    this.current = version;
    return true;
  }

  /**
   * 呼叫模型前先保存一筆暫定紀錄（incomplete）：重新驗證中途被打斷（程序被殺、斷電）時，
   * 重啟後讀到的是「需要重新驗證」，不是失敗，也不會在背景自己再花模型呼叫。
   * 寫不進去 → 這個版本記為失敗（只在記憶體）並回 false，呼叫端不得呼叫模型。
   */
  async saveProvisional(version: string, at: string): Promise<boolean> {
    const provisional: ClaudeVersionRecord = {
      version,
      outcome: 'incomplete',
      verifiedAt: at,
      cases: [],
      modelCalls: 0,
      reason: PROVISIONAL_REASON,
    };
    try {
      if (!this.store) throw new Error('沒有保存介面');
      await this.store.save(provisional);
      return true;
    } catch (error) {
      const why = error instanceof Error ? error.message : '未知錯誤';
      this.reverifying = null;
      this.apply({
        ...provisional,
        outcome: 'failed',
        reason: `無法保存驗證狀態（${why}），未呼叫模型`,
      });
      return false;
    }
  }

  /**
   * 結束重新驗證：先保存，保存成功且通過才接受這個版本；保存失敗一律視為失敗（停用這個版本）。
   * 回傳最後實際生效的紀錄。
   */
  async finishReverify(record: ClaudeVersionRecord): Promise<ClaudeVersionRecord> {
    let final = record;
    try {
      await this.store?.save(record);
    } catch (error) {
      const why = error instanceof Error ? error.message : '未知錯誤';
      final = { ...record, outcome: 'failed', reason: `無法保存驗證結果（${why}）` };
    }
    this.reverifying = null;
    this.apply(final);
    return final;
  }
}
