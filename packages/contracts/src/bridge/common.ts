import { z } from 'zod';

import type { BridgeOperation } from './operations.ts';

/**
 * 編輯器操作共用的 schema 積木（P1-T041，R7）。
 * 請求裡指向既有物件的欄位一律是 OpaqueId：helper 自己配發的不透明 ID，
 * 不是路徑、指令、CLI 參數或模型名稱，helper 只拿來查自己的資料表。
 */

/**
 * 請求中的物件 ID：1–128 個英數、底線、連字號，開頭必須是英數。
 * 擋掉 `/`、`.`、空白、開頭 `-`，避免被當成路徑或命令列旗標。RoleCraft 產生的 UUID v4 符合。
 */
export const OpaqueId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export type OpaqueId = z.infer<typeof OpaqueId>;

/** 請求中一次帶多個 ID 的上限（例如授權勾選）。 */
export const MAX_IDS_PER_REQUEST = 5000;

/** 不帶任何參數的 payload：只接受空物件。 */
export const EmptyPayload = z.strictObject({});

/** 只回成功、不帶資料的回應。 */
export const Ack = z.strictObject({ ok: z.literal(true) });

/** 組一個操作的 request schema：恰好 { op, payload }，兩層都 strict。 */
export function bridgeOp<Op extends BridgeOperation, P extends z.ZodType>(op: Op, payload: P) {
  return z.strictObject({ op: z.literal(op), payload });
}
