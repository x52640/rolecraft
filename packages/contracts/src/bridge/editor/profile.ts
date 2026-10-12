import { z } from 'zod';

import { Profile } from '../../entities/profile.ts';
import { EmptyPayload, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * profile.*：唯讀已確認的 Profile（D28；resume-output「內容回填到求職網站」，P1-T079 實作）。
 * 供複製按鈕按下時重新讀取比對；沒有寫入操作（寫入只走 import.confirm）。
 */

/** 已確認的 Profile（R10）：未確認的不回。 */
export const ConfirmedProfile = Profile.refine((p) => p.pdfParseConfirmed, {
  path: ['pdfParseConfirmed'],
  message: '只回已確認的 Profile',
});

export const PROFILE_SCHEMAS = {
  /**
   * 資料區唯一那份已確認的 Profile；沒有為 null。
   * 已有多份（舊資料）時回 invalid_request＋固定原因 multiple_profiles。
   */
  'profile.get': {
    request: bridgeOp('profile.get', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), profile: ConfirmedProfile.nullable() }),
    ),
  },
} as const;
