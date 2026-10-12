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

/** 分組建議裡的一份文件：helper 配發的來源文件 ID＋在授權資料夾內的相對名稱（不含上層路徑）。 */
export const SuggestedDocument = z.strictObject({ sourceDocumentId: Id, name: z.string() });
export type SuggestedDocument = z.infer<typeof SuggestedDocument>;

export const SuggestedGroup = z.strictObject({
  name: z.string().min(1),
  documents: z.array(SuggestedDocument).min(1),
});
export type SuggestedGroup = z.infer<typeof SuggestedGroup>;

/** 分組建議失敗原因：R6 不通過、服務錯誤、輸出不合格（整份不採用）、額度用完、取消。 */
export const ProjectSuggestionFailure = z.enum([
  'run_check_failed',
  'provider_error',
  'invalid_output',
  'quota_exhausted',
  'cancelled',
]);
export type ProjectSuggestionFailure = z.infer<typeof ProjectSuggestionFailure>;

/** 最近一次分組建議（D23、P1-T063）。建議本身不建立任何專案；只存在 helper 記憶體。 */
export const ProjectSuggestionView = z
  .strictObject({
    suggestionId: Id,
    state: z.enum(['running', 'ready', 'failed']),
    /** 只有 failed 有值 */
    failure: ProjectSuggestionFailure.nullable(),
    /** 只有 ready 可能非空 */
    groups: z.array(SuggestedGroup),
    /** 沒被分到任何組的文件（ready 時）；執行中為送出的全部文件 */
    ungrouped: z.array(SuggestedDocument),
  })
  .refine((v) => (v.state === 'failed') === (v.failure !== null), {
    path: ['failure'],
    message: '只有失敗有原因',
  })
  .refine((v) => v.state === 'ready' || v.groups.length === 0, { path: ['groups'] });
export type ProjectSuggestionView = z.infer<typeof ProjectSuggestionView>;

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
  /** 使用者按下才觸發：在背景請 AI 建議專案分組，立即回最近一次建議（執行中）。不建立專案。 */
  'analysis.suggest_projects': {
    request: bridgeOp('analysis.suggest_projects', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), suggestion: ProjectSuggestionView }),
    ),
  },
  /** 最近一次分組建議；沒有建議過（或 helper 重開後）回 null。 */
  'analysis.project_suggestion': {
    request: bridgeOp('analysis.project_suggestion', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), suggestion: ProjectSuggestionView.nullable() }),
    ),
  },
} as const;
