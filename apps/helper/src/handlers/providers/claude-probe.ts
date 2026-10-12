// Claude 的檢查與模型短驗證：只透過 @rolecraft/providers 既有的檢查路徑（P1-T012、P1-T039），
// helper 不自己組 CLI 命令列、不讀憑證、不碰環境變數的值（只把 process.env 交給 core 清理）。
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import type {
  CheckOutcome,
  ReverifyOutcome,
  RunCheckRecord,
  VersionCheck,
} from '@rolecraft/contracts';
import {
  checkConnection,
  CLAUDE_MODEL_CANDIDATES,
  type ClaudeService,
  type ClaudeVersionStore,
  createClaudeService,
  type RunDeps,
  verifyClaudeModel,
} from '@rolecraft/providers';

import { helperClaudeDeps } from '../../services/claude-deps.ts';

/** 一次重新檢查的結果（不含路徑、帳號、環境變數值）。 */
export interface ClaudeCheck {
  readonly installed: CheckOutcome;
  readonly login: CheckOutcome;
  readonly eligibility: CheckOutcome;
  /** R6 總結（訂閱登入、環境清理、CLI 設定、執行模式） */
  readonly subscriptionOnly: CheckOutcome;
  /** R5：CLI 版本是已驗證版本（ADR-0002 或 D22 重新驗證通過），且服務未停用 */
  readonly isolation: CheckOutcome;
  /** 目前版本停用（failed）或上次重新驗證沒完成（incomplete）；其他情況 null／省略（P1-T062） */
  readonly versionIssue?: VersionCheck | null;
  readonly checkedAt: string;
}

/** 重新啟用（D24）的結果；reason 已去掉路徑。 */
export interface ClaudeReverify {
  readonly outcome: ReverifyOutcome;
  readonly reason: string | null;
}

/** 模型短驗證結果。 */
export interface ClaudeModelCheck {
  readonly verification: CheckOutcome;
  /** 額度用完（R9：停止、不重試） */
  readonly quotaExhausted: boolean;
  /** 執行前就被擋下（版本閘門、R6 未通過、未執行）：服務狀態已不可信，需重新檢查 */
  readonly blocked: boolean;
  /** R6 確認紀錄（S9-2 證據）；版本被擋、未執行時為 null */
  readonly record: RunCheckRecord | null;
}

/** 連線檢查選項（P1-T070）。 */
export interface ClaudeCheckOptions {
  /**
   * false＝自動連線檢查：只讀版本、不做 D22／D24 重新驗證，保證 0 次模型呼叫。
   * 預設 true（使用者按「重新檢查」：沒有紀錄或未完成的版本照 D22／D24 重新驗證）。
   */
  readonly reverify?: boolean;
}

export interface ClaudeProbe {
  check(options?: ClaudeCheckOptions): Promise<ClaudeCheck>;
  /** model 只能是 helper 自己的候選常數（呼叫端以 candidateId 查表取得） */
  verifyModel(model: string): Promise<ClaudeModelCheck>;
  /** 目前版本的停用／未完成狀態，從版本閘門即時算（不啟動任何程式）；測試替換的 probe 可省略 */
  versionIssue?(): VersionCheck | null;
  /** 使用者重新啟用：目前版本停用或未完成時重跑注入測試（呼叫模型 3 次以內）；測試替換的 probe 可省略 */
  reverify?(): Promise<ClaudeReverify>;
  /** 候選別名（CLI 沒有列模型的指令，所以是常數；可用與否要 verifyModel） */
  readonly candidates: readonly string[];
}

/**
 * 模型短驗證（一次極短提示）的執行逾時（P1-T044 對抗驗證）：逾時中止 CLI 行程群組，
 * 不讓 providers-service 的單一驗證槽位被卡住。
 */
export const CLAUDE_MODEL_VERIFY_TIMEOUT_MS = 120_000;

export interface ClaudeProbeOptions {
  /** 共用的 Claude 服務（版本閘門要與一般執行共用同一個才互斥）；預設自己建一個、不接保存介面 */
  readonly service?: ClaudeService;
  /** 測試用：覆寫執行 deps（環境、時鐘、子程序啟動函式）；一律再經 helperClaudeDeps 套串流守門 */
  readonly runDeps?: Partial<RunDeps>;
  /** 預設 providers 的 CLAUDE_MODEL_CANDIDATES（不在 helper 另寫一份清單） */
  readonly candidates?: readonly string[];
}

/**
 * helper 共用的 Claude 服務（providers 檢查、短驗證與生成端共用同一個版本閘門）。執行一律經
 * helperClaudeDeps（本檔與 messages/claude-engine.ts）。給了 store 才做 D22 自動重新驗證（P1-T058）。
 */
export function createHelperClaudeService(store?: ClaudeVersionStore): ClaudeService {
  return createClaudeService(store ? { store } : {});
}

/** 給使用者看的原因不帶路徑（R7）：錯誤訊息可能含 CLI 或暫存目錄的絕對路徑。 */
export const redactPaths = (text: string): string =>
  text.replace(/(?:~|\/)[^\s：；，、（）()「」]*\/[^\s：；，、（）()「」]*/gu, '〔路徑〕');

function versionIssueOf(service: ClaudeService): VersionCheck | null {
  const state = service.gate.state;
  if (state.kind === 'disabled') return { state: 'failed', reason: redactPaths(state.reason) };
  if (state.kind === 'needs_reverify') {
    return { state: 'incomplete', reason: redactPaths(state.reason) };
  }
  return null;
}

export function createClaudeProbe(options: ClaudeProbeOptions = {}): ClaudeProbe {
  // 沒注入保存介面 → 只接受 ADR-0002 驗證版本、不做自動重新驗證（0 次模型呼叫）。
  const service = options.service ?? createClaudeService();
  const base = (): RunDeps => ({
    parentEnv: process.env,
    now: () => new Date(),
    newId: randomUUID,
    ...options.runDeps,
  });
  const deps = () => helperClaudeDeps(base(), { acceptVersion: service.gate.isAccepted });

  return {
    candidates: options.candidates ?? CLAUDE_MODEL_CANDIDATES,

    async check(checkOptions = {}) {
      const d = deps();
      // 先讀目前版本（observe）再做連線檢查：上一個版本被停用時，連線檢查會因閘門短路而讀不到
      // 已更新的新版本，一直回舊版本的失敗（P1-T062 codex review）。
      const version =
        checkOptions.reverify === false
          ? await service.observeVersion(d)
          : await service.ensureVersion(d);
      const report = await checkConnection(service.adapter, d);
      const { installation, connection } = report;
      let isolation: CheckOutcome = 'unknown';
      if (installation.installed === 'passed') {
        isolation = version.status === 'blocked' ? 'failed' : 'passed';
      }
      if (service.adapter.support.state !== 'supported') isolation = 'failed';
      return {
        installed: installation.installed,
        login: connection.login,
        eligibility: connection.eligibility,
        subscriptionOnly: connection.subscriptionOnly,
        isolation,
        versionIssue: versionIssueOf(service),
        checkedAt: connection.checkedAt,
      };
    },

    versionIssue: () => versionIssueOf(service),

    async reverify() {
      const result = await service.reverify(deps());
      if (result.status === 'reverified') return { outcome: 'passed', reason: null };
      if (result.status === 'blocked') {
        return {
          outcome: result.record ? 'failed' : 'blocked',
          reason: redactPaths(result.reason),
        };
      }
      return {
        outcome: 'not_needed',
        reason: `Claude CLI ${result.version} 目前沒有停用，也沒有未完成的重新驗證，不需要重新啟用`,
      };
    },

    async verifyModel(model) {
      const d = deps();
      const version = await service.ensureVersion(d);
      if (version.status === 'blocked') {
        return { verification: 'unknown', quotaExhausted: false, blocked: true, record: null };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CLAUDE_MODEL_VERIFY_TIMEOUT_MS);
      const probe = await verifyClaudeModel(service.adapter, model, d, controller.signal).finally(
        () => clearTimeout(timer),
      );
      if (!probe.record.executed) {
        return {
          verification: 'unknown',
          quotaExhausted: false,
          blocked: true,
          record: probe.record,
        };
      }
      if (probe.error?.kind === 'cancelled') {
        // 只有自己的逾時會取消：無法確認，不記為失敗。
        return {
          verification: 'unknown',
          quotaExhausted: false,
          blocked: false,
          record: probe.record,
        };
      }
      return {
        verification: probe.available ? 'passed' : 'failed',
        quotaExhausted: probe.error?.kind === 'quota_exhausted',
        blocked: false,
        record: probe.record,
      };
    },
  };
}
