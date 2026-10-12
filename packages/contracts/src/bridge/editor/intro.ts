import { z } from 'zod';

import { ApplicationIntro, IntroProblem } from '../../entities/application-intro.ts';
import { ClaimType, CompletionStatus } from '../../entities/claim.ts';
import { Id, Timestamp } from '../../entities/common.ts';
import { ClaimCitation, StatedCompletion } from '../../entities/resume-version.ts';
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

/** 承諾字眼與聯絡方式（D25 擁有者裁定：只擋模型產生的內容；使用者編輯後只提示、不停用複製）。 */
export const INTRO_COMMITMENT_PROBLEMS = [
  'commits_time',
  'commits_salary',
  'commits_start_date',
  'contact_info',
] as const satisfies readonly IntroProblem[];
export const IntroCommitmentWarning = z.enum(INTRO_COMMITMENT_PROBLEMS);
export type IntroCommitmentWarning = z.infer<typeof IntroCommitmentWarning>;

/**
 * 引用的事實項對照（自介沒有逐段對照畫面，由使用者在這裡把關措辭與宣稱的完成程度，R1）：
 * 事實項內容、類型、目前完成狀態，與自介把它寫成的完成程度；事實項已不存在時 text、type 為 null。
 */
export const IntroCitedClaim = z.strictObject({
  claimId: Id,
  text: z.string().nullable(),
  type: ClaimType.nullable(),
  completionStatus: CompletionStatus.nullable(),
  statedCompletion: StatedCompletion.nullable(),
  /** 目前是否可用於生成（待複核、來源已移除未確認等為 false） */
  usable: z.boolean(),
});
export type IntroCitedClaim = z.infer<typeof IntroCitedClaim>;

/**
 * 目前自介文字的檢查結果（依目前的事實項重跑）。problem 為 null 才能複製（不含承諾字眼）；
 * warning 是使用者編輯後出現的承諾字眼或聯絡方式，只提示、不停用複製。
 */
export const IntroCheckView = z.strictObject({
  length: z.int().min(0),
  problem: IntroProblem.exclude(INTRO_COMMITMENT_PROBLEMS).nullable(),
  warning: IntroCommitmentWarning.nullable(),
  citations: z.array(IntroCitedClaim),
});
export type IntroCheckView = z.infer<typeof IntroCheckView>;

/** 未通過草稿標出的問題片段上限（筆數、每筆字元）。 */
export const INTRO_DRAFT_FRAGMENTS = { max: 20, maxChars: 200 } as const;

/**
 * 沒通過檢查的模型輸出（P1-T071）：不是已存自介、不能複製；只存在 helper 記憶體（重開後消失）。
 * 使用者可在草稿上修改並儲存（照常重跑檢查，通過才成為正式自介），或按「請 AI 修正」帶問題回饋重寫一次。
 * fragments 是問題片段（例如沒有出處的數字），取自草稿文字本身，只是資料。
 */
export const IntroDraft = z.strictObject({
  text: z.string(),
  /** 模型列出且存在、不重複的引用（儲存草稿時用它重跑檢查） */
  citations: z.array(ClaimCitation),
  /** 未通過的原因（含承諾字眼：草稿源自模型，整份照模型內容的規則檢查） */
  problem: IntroProblem,
  fragments: z
    .array(z.string().min(1).max(INTRO_DRAFT_FRAGMENTS.maxChars))
    .max(INTRO_DRAFT_FRAGMENTS.max),
  /** 這份草稿產生（或最近一次儲存）的時間 */
  generatedAt: Timestamp,
});
export type IntroDraft = z.infer<typeof IntroDraft>;

const JobRef = z.strictObject({ jobSnapshotId: OpaqueId });

export const INTRO_SCHEMAS = {
  /**
   * 使用者按下才觸發：在背景產生投遞自介，立即回覆（執行中）。已有執行中的就回同一個狀態、不重送。
   * 快照未確認、沒有可用事實項、沒有選定且可用的模型、超過輸入預算回 invalid_request，不呼叫模型。
   * fix 為 true＝「請 AI 修正」（P1-T071）：把目前未通過草稿與它的問題回饋給模型重寫一次；沒有草稿回 invalid_request。
   */
  'intro.generate': {
    request: bridgeOp(
      'intro.generate',
      z.strictObject({ jobSnapshotId: OpaqueId, fix: z.boolean().optional() }),
    ),
    response: withFailure(z.strictObject({ ok: z.literal(true), generation: IntroGenerationView })),
  },
  /**
   * 最近一份自介、其檢查結果與最近一次產生狀態；沒有自介時 intro、check 為 null。
   * draft：最近一次沒通過檢查的草稿（P1-T071；沒有時為 null，舊版 helper 不帶）。
   */
  'intro.get': {
    request: bridgeOp('intro.get', JobRef),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        intro: ApplicationIntro.nullable(),
        check: IntroCheckView.nullable(),
        generation: IntroGenerationView.nullable(),
        draft: IntroDraft.nullable().optional(),
      }),
    ),
  },
  /**
   * 儲存使用者編輯（只存檔、不送出），回傳重跑後的檢查結果。沒有自介時回 invalid_request。
   * draft 為 true：儲存未通過草稿上的修改（P1-T071），通過檢查（含承諾字眼）才成為正式自介並回傳；
   * 沒通過回 invalid_request，修改保留在草稿上（重新讀取可看到新的問題）。
   */
  'intro.update': {
    request: bridgeOp(
      'intro.update',
      z.strictObject({
        jobSnapshotId: OpaqueId,
        text: z.string().max(INTRO_EDIT_MAX_CHARS),
        draft: z.boolean().optional(),
      }),
    ),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), intro: ApplicationIntro, check: IntroCheckView }),
    ),
  },
} as const;
