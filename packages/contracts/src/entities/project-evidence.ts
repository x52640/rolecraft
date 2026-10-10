import { z } from 'zod';

import { Id, NonEmptyText } from './common.ts';

/**
 * 專案經歷：摘要與所屬事實項。摘要只是事實項的彙整，本身不帶確認狀態（R1），
 * 所以這裡刻意沒有任何狀態欄位。
 */
export const ProjectEvidence = z.strictObject({
  id: Id,
  name: NonEmptyText,
  summary: z.string(),
  claimIds: z.array(Id),
});
export type ProjectEvidence = z.infer<typeof ProjectEvidence>;
