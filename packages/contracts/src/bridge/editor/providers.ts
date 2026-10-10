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

export const ServiceStatus = z.strictObject({
  service: Provider,
  state: ServiceState,
  login: CheckOutcome,
  eligibility: CheckOutcome,
  subscriptionOnly: CheckOutcome,
  checkedAt: Timestamp.nullable(),
  /** 目前選定的候選（helper 配發的 ID） */
  selectedCandidateId: Id.nullable(),
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
  /** 開啟該服務的官方登入流程；不代為輸入帳密、不擷取憑證（D3）。 */
  'providers.start_login': {
    request: bridgeOp('providers.start_login', ServiceRef),
    response: withFailure(Ack),
  },
} as const;
