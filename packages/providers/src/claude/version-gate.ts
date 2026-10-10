import type { SupportStatus } from '../core/adapter.ts';
import { CLAUDE_VERIFIED_VERSION } from './constants.ts';

/**
 * Claude CLI 版本閘門（plan.md D22、P1-T039）。記住哪些版本通過了自動重新驗證，
 * 並讓「重新驗證」與「一般執行」互斥：
 * - 重新驗證中：一般執行一律拒絕（不排隊等待）；另一個重新驗證也拒絕。
 * - 一般執行進行中：不開始重新驗證（回 busy），由呼叫端稍後再試。
 * - 任一次重新驗證失敗：整個服務停用（cannot_confirm），不自動重試任何版本；
 *   失敗紀錄也保存，重啟後仍停用。人工重新啟用（由呼叫端移除失敗紀錄）是後續 Task。
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
  readonly outcome: 'verified' | 'failed';
  /** ISO 時間 */
  readonly verifiedAt: string;
  readonly cases: readonly ReverifyCaseResult[];
  /** 這次重新驗證實際呼叫模型的次數 */
  readonly modelCalls: number;
  /** 失敗原因（outcome=failed 時） */
  readonly reason?: string;
}

/** 已驗證版本清單的保存介面；儲存位置由呼叫端決定（本 Task 不接 storage）。 */
export interface ClaudeVersionStore {
  load(): Promise<readonly ClaudeVersionRecord[]>;
  save(record: ClaudeVersionRecord): Promise<void>;
}

export type GateState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'reverifying'; readonly version: string }
  | { readonly kind: 'disabled'; readonly reason: string };

const isRecord = (value: unknown): value is ClaudeVersionRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['version'] === 'string' &&
    r['version'] !== '' &&
    (r['outcome'] === 'verified' || r['outcome'] === 'failed') &&
    typeof r['verifiedAt'] === 'string' &&
    Array.isArray(r['cases']) &&
    typeof r['modelCalls'] === 'number'
  );
};

export const PROVISIONAL_REASON = '重新驗證未完成';

export const REVERIFYING_REASON = 'Claude CLI 版本已變更，正在自動重新驗證；期間不執行任何工作';

export class ClaudeVersionGate {
  private readonly accepted = new Set<string>([CLAUDE_VERIFIED_VERSION]);
  private stateValue: GateState = { kind: 'ready' };
  private inFlight = 0;
  private loaded: Promise<boolean> | null = null;
  private storeUsable = false;

  private readonly store: ClaudeVersionStore | null;

  constructor(store: ClaudeVersionStore | null = null) {
    this.store = store;
  }

  get state(): GateState {
    return this.stateValue;
  }

  /** 是否已驗證（ADR-0002 驗證版本，或保存清單中通過重新驗證的版本）。 */
  readonly isAccepted = (version: string): boolean => this.accepted.has(version);

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
      // 同一版本以最後一筆為準（暫定失敗紀錄之後的 verified 會覆蓋它）。
      const latest = new Map<string, ClaudeVersionRecord>();
      for (const record of records) latest.set(record.version, record);
      for (const record of latest.values()) this.apply(record);
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
    if (record.outcome === 'verified') {
      this.accepted.add(record.version);
    } else {
      this.stateValue = {
        kind: 'disabled',
        reason: `Claude CLI ${record.version} 自動重新驗證失敗（${record.verifiedAt}）：${record.reason ?? '未通過'}；已停用，不自動重試`,
      };
    }
  }

  /** 給 ProviderAdapter.support 用：停用或重新驗證中都是「無法確認」。 */
  support(): SupportStatus {
    const s = this.stateValue;
    if (s.kind === 'disabled') return { state: 'cannot_confirm', reason: s.reason };
    if (s.kind === 'reverifying') return { state: 'cannot_confirm', reason: REVERIFYING_REASON };
    return { state: 'supported' };
  }

  /** 一般執行開始；重新驗證中或已停用 → null（拒絕）。成功時回傳結束時要呼叫的釋放函式。 */
  enterRun(): (() => void) | null {
    if (this.stateValue.kind !== 'ready') return null;
    this.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
    };
  }

  /** 開始重新驗證；已停用、已有重新驗證、或有一般執行進行中 → false。 */
  beginReverify(version: string): boolean {
    if (this.stateValue.kind !== 'ready' || this.inFlight > 0 || !this.storeUsable) return false;
    this.stateValue = { kind: 'reverifying', version };
    return true;
  }

  /**
   * 呼叫模型前先保存一筆暫定失敗紀錄：重新驗證中途當掉（程序被殺、斷電）時，
   * 重啟後讀到的就是失敗 → 維持停用，不會不知不覺再花一次模型呼叫。
   * 寫不進去 → 直接停用並回 false，呼叫端不得呼叫模型。
   */
  async saveProvisional(version: string, at: string): Promise<boolean> {
    const provisional: ClaudeVersionRecord = {
      version,
      outcome: 'failed',
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
      this.stateValue = {
        kind: 'disabled',
        reason: `Claude CLI ${version} 需要重新驗證，但無法保存驗證狀態（${why}）；未呼叫模型，已停用`,
      };
      return false;
    }
  }

  /**
   * 結束重新驗證：先保存，保存成功且通過才接受新版本；保存失敗一律視為失敗（停用）。
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
    this.stateValue = { kind: 'ready' };
    this.apply(final);
    return final;
  }
}
