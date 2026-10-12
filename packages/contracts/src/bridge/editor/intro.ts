import { z } from 'zod';

import { ApplicationIntro, IntroProblem } from '../../entities/application-intro.ts';
import { bridgeOp, OpaqueId } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * intro.*：針對職缺快照產生 300 字內投遞自介（D25、D7；P1-T064）。
 * 請求只帶職缺快照 ID 與使用者編輯的文字；服務與模型由 helper 決定（R7）。
 * 刻意沒有任何送出操作：自介只能編輯與複製。
 */

/** 編輯文字的請求上限（字元）；超過 INTRO_MAX_CHARS 仍可存，只是檢查不通過、不能複製。 */
export const INTRO_EDIT_MAX_CHARS = 5_000;

/** 產生失敗的原因：檢查不通過（看 problem）、輸出格式不合格、R6 不通過、服務錯誤、額度用完、取消、輸入在產生期間變了。 */
export const IntroGenerationFailure = z.enum([
  'check_failed',
  'invalid_output',
  'run_check_failed',
  'provider_error',
  'quota_exhausted',
  'cancelled',
  'snapshot_changed', // 產生期間職缺快照被修改或取消確認
  'intro_changed', // 產生期間使用者改過自介：不覆蓋
]);
export type IntroGenerationFailure = z.infer<typeof IntroGenerationFailure>;

/** 最近一次產生（只存在 helper 記憶體，helper 重開後為 null）。 */
export const IntroGenerationView = z
  .strictObject({
    state: z.enum(['running', 'succeeded', 'failed']),
    /** 只有 failed 有值 */
    failure: IntroGenerationFailure.nullable(),
    /** 只有 failure 為 check_failed 時有值 */
    problem: IntroProblem.nullable(),
  })
  .refine((v) => (v.state === 'failed') === (v.failure !== null), {
    path: ['failure'],
    message: '只有失敗有原因',
  })
  .refine((v) => (v.failure === 'check_failed') === (v.problem !== null), {
    path: ['problem'],
    message: '只有檢查不通過有問題代碼',
  });
export type IntroGenerationView = z.infer<typeof IntroGenerationView>;

/** 目前自介文字的檢查結果（依目前的事實項重跑）；problem 為 null 才能複製。 */
export const IntroCheckView = z.strictObject({
  length: z.int().min(0),
  problem: IntroProblem.nullable(),
});
export type IntroCheckView = z.infer<typeof IntroCheckView>;

const JobRef = z.strictObject({ jobSnapshotId: OpaqueId });

export const INTRO_SCHEMAS = {
  /**
   * 使用者按下才觸發：在背景產生投遞自介，立即回覆（執行中）。已有執行中的就回同一個狀態、不重送。
   * 快照未確認、沒有可用事實項、沒有選定且可用的模型、超過輸入預算回 invalid_request，不呼叫模型。
   */
  'intro.generate': {
    request: bridgeOp('intro.generate', JobRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), generation: IntroGenerationView })),
  },
  /** 最近一份自介、其檢查結果與最近一次產生狀態；沒有自介時 intro、check 為 null。 */
  'intro.get': {
    request: bridgeOp('intro.get', JobRef),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        intro: ApplicationIntro.nullable(),
        check: IntroCheckView.nullable(),
        generation: IntroGenerationView.nullable(),
      }),
    ),
  },
  /** 儲存使用者編輯（只存檔、不送出），回傳重跑後的檢查結果。沒有自介時回 invalid_request。 */
  'intro.update': {
    request: bridgeOp(
      'intro.update',
      z.strictObject({ jobSnapshotId: OpaqueId, text: z.string().max(INTRO_EDIT_MAX_CHARS) }),
    ),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), intro: ApplicationIntro, check: IntroCheckView }),
    ),
  },
} as const;
