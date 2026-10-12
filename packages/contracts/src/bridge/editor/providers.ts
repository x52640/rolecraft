import { z } from 'zod';

import { Id, NonEmptyText, Provider, Timestamp } from '../../entities/common.ts';
import { CheckOutcome } from '../../entities/provider-connection.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * providers.*：供應商狀態與設定精靈（F01、R5、R6、S9-1、S9-3；P1-T030）。
 * 請求只能指定服務（封閉列舉）與 helper 列過的候選 ID；helper 只拿它查自己配發的清單，不把請求字串直接當成模型參數（R7）。
 * （鍵名用 service／candidate，不用 provider／model，配合 contracts 的禁用鍵名檢查。）
 */

/** 給使用者看的狀態；只有 R5、R6 都通過才可為 available。 */
export const ServiceState = z.enum([
  'tool_missing', // 官方工具缺少
  'not_logged_in', // 未登入
  'eligibility_unknown', // 資格未知
  'available', // 可用
  'quota_exhausted', // 額度不足
  'unsupported', // 尚未支援（R5 證明不了、或首版未接）
]);
export type ServiceState = z.infer<typeof ServiceState>;

/**
 * Claude CLI 目前版本的重新驗證狀態（D22、D24；P1-T062）：running＝使用者按了重新啟用、正在跑；
 * failed＝這個版本最後一次重新驗證失敗、已停用；incomplete＝上次重新驗證中途被打斷、需要重新驗證。
 */
export const VersionCheckState = z.enum(['running', 'failed', 'incomplete']);
export type VersionCheckState = z.infer<typeof VersionCheckState>;

export const VersionCheck = z.strictObject({ state: VersionCheckState, reason: NonEmptyText });
export type VersionCheck = z.infer<typeof VersionCheck>;

/**
 * 最近一次「重新啟用」的結果：passed 通過、failed 注入測試沒通過（仍停用）、
 * not_needed 目前版本不需要（沒有呼叫模型）、blocked 沒有開始（例如有其他 Claude 執行進行中）。
 */
export const ReverifyOutcome = z.enum(['passed', 'failed', 'not_needed', 'blocked']);
export type ReverifyOutcome = z.infer<typeof ReverifyOutcome>;

export const LastReverify = z.strictObject({
  outcome: ReverifyOutcome,
  reason: NonEmptyText.nullable(),
  finishedAt: Timestamp,
});
export type LastReverify = z.infer<typeof LastReverify>;

export const ServiceStatus = z.strictObject({
  service: Provider,
  state: ServiceState,
  login: CheckOutcome,
  eligibility: CheckOutcome,
  subscriptionOnly: CheckOutcome,
  checkedAt: Timestamp.nullable(),
  /** 目前選定的候選（helper 配發的 ID） */
  selectedCandidateId: Id.nullable(),
  /** 目前版本需要處理的重新驗證狀態；沒有、或還沒檢查過時為 null／省略（P1-T062） */
  versionCheck: VersionCheck.nullable().optional(),
  /** 這個 helper 程序內最近一次重新啟用的結果；沒有時為 null／省略（P1-T062） */
  lastReverify: LastReverify.nullable().optional(),
});
export type ServiceStatus = z.infer<typeof ServiceStatus>;

/** 可選模型候選：ID 由 helper 配發，label 只供顯示。 */
export const ServiceCandidate = z.strictObject({ candidateId: Id, label: NonEmptyText });
export type ServiceCandidate = z.infer<typeof ServiceCandidate>;

const ServiceRef = z.strictObject({ service: Provider });

export const PROVIDERS_SCHEMAS = {
  /** 三家最近一次檢查的狀態（不觸發新檢查）。 */
  'providers.status': {
    request: bridgeOp('providers.status', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), services: z.array(ServiceStatus) }),
    ),
  },
  /** 重新檢查一家（安裝、登入、R5、R6），回新的狀態。 */
  'providers.recheck': {
    request: bridgeOp('providers.recheck', ServiceRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), status: ServiceStatus })),
  },
  /** 列出該服務實際提供、帳號可用的模型候選；不假設所有模型可用（F01）。 */
  'providers.list_candidates': {
    request: bridgeOp('providers.list_candidates', ServiceRef),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), candidates: z.array(ServiceCandidate) }),
    ),
  },
  /**
   * 選定候選並做短驗證。candidateId 必須是 helper 自己列過的；helper 用它查自己的清單，
   * 不把請求字串當成模型名稱或參數傳給 CLI。
   */
  'providers.select_candidate': {
    request: bridgeOp(
      'providers.select_candidate',
      z.strictObject({ service: Provider, candidateId: OpaqueId }),
    ),
    response: withFailure(z.strictObject({ ok: z.literal(true), verification: CheckOutcome })),
  },
  /**
   * 重新啟用 Claude（D24）：目前版本停用或未完成時，在背景對目前版本重跑注入測試（3–5 次以內的極短呼叫），
   * 通過才接受。立即回覆（重新驗證可能要幾分鐘）；進度與結果看 providers.status 的 versionCheck／lastReverify。
   * started=false：已有一次在跑。沒有「不測就放行」的路徑。
   */
  'providers.reverify_claude': {
    request: bridgeOp('providers.reverify_claude', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), started: z.boolean(), status: ServiceStatus }),
    ),
  },
  /** 開啟該服務的官方登入流程；不代為輸入帳密、不擷取憑證（D3）。 */
  'providers.start_login': {
    request: bridgeOp('providers.start_login', ServiceRef),
    response: withFailure(Ack),
  },
} as const;
