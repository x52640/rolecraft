import { z } from 'zod';

import { CaptureMethod, Id, NonEmptyText, Platform } from './common.ts';
import { linkedInManualOnly } from './job-snapshot.ts';

/**
 * 招募訊息與回覆草稿（architecture.md MessageDraft、F08、R10）。
 * 草稿只能編輯與複製，不自動送出（D7）。
 */
export const MessageDraft = z
  .strictObject({
    id: Id,
    platform: Platform,
    captureMethod: CaptureMethod,
    /** 使用者選定訊息的全文（R10 必要欄位） */
    selectedMessageText: NonEmptyText,
    /** 使用者是否改過擷取內容（R10） */
    userModified: z.boolean(),
    /** 關聯的職缺快照（可無） */
    jobSnapshotId: Id.nullable(),
    /** 回覆意圖。F08 只舉例（接受邀約、詢問職務、婉拒），未定封閉清單，暫為自由文字。 */
    replyIntent: z.string(),
    draft: z.string(),
  })
  .refine(linkedInManualOnly.check, linkedInManualOnly.params);
export type MessageDraft = z.infer<typeof MessageDraft>;
