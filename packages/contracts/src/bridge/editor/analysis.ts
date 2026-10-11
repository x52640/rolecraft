import { z } from 'zod';

import { Id } from '../../entities/common.ts';
import { PauseReason } from '../../entities/work-job.ts';
import { EmptyPayload, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * analysis.*：分析授權資料夾產生事實項、查詢進度與手動續跑（F04、F05、R2、R4、R9、D21；P1-T060）。
 * 請求不帶任何路徑、檔案或模型設定：分析範圍就是目前的授權集合，模型是使用者在設定頁選定的。
 */

/** 分析工作狀態：執行中／全部完成／已暫停（看 pauseReason）／被擋（看 blockReason）。 */
export const AnalysisState = z.enum(['running', 'completed', 'paused', 'blocked']);
export type AnalysisState = z.infer<typeof AnalysisState>;

/** 被擋的原因：R6 不通過、供應商回報不可重試的錯誤、暫停期間來源文件變了（要重新規劃）。 */
export const AnalysisBlockReason = z.enum([
  'run_check_failed',
  'provider_error',
  'sources_changed',
]);
export type AnalysisBlockReason = z.infer<typeof AnalysisBlockReason>;

/** 最近一次分析工作的進度。 */
export const AnalysisStatusView = z
  .strictObject({
    workJobId: Id,
    state: AnalysisState,
    /** 只有 state 為 paused 時有值 */
    pauseReason: PauseReason.nullable(),
    /** 只有 state 為 blocked 時有值 */
    blockReason: AnalysisBlockReason.nullable(),
    completedUnits: z.int().min(0),
    totalUnits: z.int().min(1),
    /** 本次工作新增的事實項數 */
    claimsAdded: z.int().min(0),
    /** 本次工作更新的既有事實項數（R2 重新判定、來源矛盾升級） */
    claimsUpdated: z.int().min(0),
  })
  .refine((v) => (v.state === 'paused') === (v.pauseReason !== null), {
    path: ['pauseReason'],
    message: '只有已暫停有暫停原因',
  })
  .refine((v) => (v.state === 'blocked') === (v.blockReason !== null), {
    path: ['blockReason'],
    message: '只有被擋有原因',
  })
  .refine((v) => v.completedUnits <= v.totalUnits, { path: ['completedUnits'] });
export type AnalysisStatusView = z.infer<typeof AnalysisStatusView>;

export const ANALYSIS_SCHEMAS = {
  /**
   * 對目前授權集合做增量分析；已有執行中的回同一個工作 id；已暫停就續跑（續跑前重做 R6，D21）。
   * 沒有需要分析的文件時 workJobId 為 null（來源變更判定仍已寫回）。
   */
  'analysis.start': {
    request: bridgeOp('analysis.start', EmptyPayload),
    response: withFailure(z.strictObject({ ok: z.literal(true), workJobId: Id.nullable() })),
  },
  /** 最近一次分析工作的狀態；沒有分析過回 null。 */
  'analysis.status': {
    request: bridgeOp('analysis.status', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), analysis: AnalysisStatusView.nullable() }),
    ),
  },
} as const;
