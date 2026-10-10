import { z } from 'zod';

import { Id, Provider } from './common.ts';

/** 單元狀態（R9）：完成並通過檢查才寫入，未完成單元的部分輸出一律丟棄。 */
export const WorkUnitStatus = z.enum([
  'pending', // 未完成
  'completed', // 完成並通過檢查
]);
export type WorkUnitStatus = z.infer<typeof WorkUnitStatus>;

/** 工作狀態（R9；P1-T005 定案）。paused 只能由使用者續跑回到 running（D21）。 */
export const WorkJobStatus = z.enum([
  'running', // 執行中
  'paused', // 已暫停
  'completed', // 全部單元完成
]);
export type WorkJobStatus = z.infer<typeof WorkJobStatus>;

/** 暫停原因（R9；P1-T005 定案）。全部都只能由使用者主動續跑（D21）。 */
export const PauseReason = z.enum([
  'quota_exhausted', // 額度耗盡
  'user_cancelled', // 使用者取消
  'retries_exhausted', // 暫時性錯誤自動重試用盡
  'interrupted', // 執行中輔助程式關閉，重開後還原
]);
export type PauseReason = z.infer<typeof PauseReason>;

/** 工作單元（R9）。每個單元記錄所用的服務與模型；未執行過時為 null。 */
export const WorkUnit = z.strictObject({
  id: Id,
  status: WorkUnitStatus,
  provider: Provider.nullable(),
  model: z.string().min(1).nullable(),
  /** 暫時性錯誤的自動重試次數（上限預設 2） */
  retryCount: z.int().min(0),
});
export type WorkUnit = z.infer<typeof WorkUnit>;

/** 工作（architecture.md WorkJob、R9）。暫停時才有暫停原因。 */
export const WorkJob = z
  .strictObject({
    id: Id,
    status: WorkJobStatus,
    units: z.array(WorkUnit).min(1),
    pauseReason: PauseReason.nullable(),
  })
  .refine((job) => (job.status === 'paused') === (job.pauseReason !== null), {
    path: ['pauseReason'],
    message: '只有已暫停的工作有暫停原因，且已暫停必須有原因',
  });
export type WorkJob = z.infer<typeof WorkJob>;
