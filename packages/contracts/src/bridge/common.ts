import { z } from 'zod';

import { StatedCompletion } from '../entities/resume-version.ts';
import type { BridgeOperation } from './operations.ts';

/**
 * 編輯器操作共用的 schema 積木（P1-T041，R7）。
 * 請求裡指向既有物件的欄位一律是 OpaqueId：helper 自己配發的不透明 ID；
 * helper 只拿它查自己配發的清單，不把請求字串直接當成路徑、指令或模型參數。
 */

/**
 * 請求中的物件 ID：1–128 個英數、底線、連字號，開頭必須是英數。
 * 擋掉 `/`、`.`、空白、開頭 `-`，避免被當成路徑或命令列旗標。RoleCraft 產生的 UUID v4 符合。
 * helper 只拿它查自己配發的清單，不把請求字串直接當成路徑、指令或模型參數。
 */
export const OpaqueId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export type OpaqueId = z.infer<typeof OpaqueId>;

/** 請求中一次帶多個 ID 的上限（例如授權勾選）。 */
export const MAX_IDS_PER_REQUEST = 5000;

/** 請求中的事實項引用：claimId 必須是 OpaqueId（entity 的 ClaimCitation 讀取驗證較寬，不用在請求）。 */
export const BridgeClaimCitation = z.strictObject({
  claimId: OpaqueId,
  statedCompletion: StatedCompletion.optional(),
});
export type BridgeClaimCitation = z.infer<typeof BridgeClaimCitation>;

/** 不帶任何參數的 payload：只接受空物件。 */
export const EmptyPayload = z.strictObject({});

/** 只回成功、不帶資料的回應。 */
export const Ack = z.strictObject({ ok: z.literal(true) });

/** 只接受 http／https 的網址（擋 file:、javascript:、data: 等）。 */
export const HttpUrl = z.url({ protocol: /^https?$/ });

/** 組一個操作的 request schema：恰好 { op, payload }，兩層都 strict。 */
export function bridgeOp<Op extends BridgeOperation, P extends z.ZodType>(op: Op, payload: P) {
  return z.strictObject({ op: z.literal(op), payload });
}
