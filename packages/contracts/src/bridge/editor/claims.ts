import { z } from 'zod';

import { Claim, ReviewStatus } from '../../entities/claim.ts';
import { NonEmptyText } from '../../entities/common.ts';
import { ProjectEvidence } from '../../entities/project-evidence.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * claims.*：事實項檢視與確認（F04、R1、R2、D14；P1-T023）。
 * 確認只能由使用者在擴充功能頁發起（content script 不能呼叫，relay 擋）。
 */

/**
 * 使用者對功能／交付物可確認的完成狀態（對應 domain ConfirmableCompletion）：
 * 「文件標示完成」「未知」不是使用者確認的結果。其他類型不得帶。
 */
export const ConfirmableCompletion = z.enum(['user_confirmed_done', 'planned']);
export type ConfirmableCompletion = z.infer<typeof ConfirmableCompletion>;

const ClaimRef = z.strictObject({ claimId: OpaqueId });

export const CLAIMS_SCHEMAS = {
  /** 列出專案（摘要不帶確認狀態，R1）。 */
  'claims.list_projects': {
    request: bridgeOp('claims.list_projects', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), projects: z.array(ProjectEvidence) }),
    ),
  },
  /** 列出某專案的事實項（含狀態與來源片段）。 */
  'claims.list': {
    request: bridgeOp('claims.list', z.strictObject({ projectId: OpaqueId })),
    response: withFailure(z.strictObject({ ok: z.literal(true), claims: z.array(Claim) })),
  },
  'claims.get': {
    request: bridgeOp('claims.get', ClaimRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), claim: Claim })),
  },
  /**
   * 確認事實項：text 是使用者確認當下看到（可一併修正）的內容，helper 記錄確認時間與這段文字（R1）。
   * 確認時間由 helper 決定，不由呼叫端給。
   * expectedReviewStatus 是畫面當時顯示的複核狀態；helper 在同一交易比對，不符就拒絕不寫入（R2），
   * 避免使用者對著過時的畫面把待複核、來源矛盾清回正常。
   */
  'claims.confirm': {
    request: bridgeOp(
      'claims.confirm',
      z.strictObject({
        claimId: OpaqueId,
        text: NonEmptyText,
        completion: ConfirmableCompletion.optional(),
        expectedReviewStatus: ReviewStatus,
      }),
    ),
    response: withFailure(Ack),
  },
  /** 修改事實項內容：既有使用者確認失效，要重新確認。 */
  'claims.update': {
    request: bridgeOp('claims.update', z.strictObject({ claimId: OpaqueId, text: NonEmptyText })),
    response: withFailure(Ack),
  },
  /** 否決（刪除）事實項：之後不得用於生成。 */
  'claims.reject': {
    request: bridgeOp('claims.reject', ClaimRef),
    response: withFailure(Ack),
  },
} as const;
