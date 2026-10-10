import { z } from 'zod';

import { Id, NonEmptyText } from '../../entities/common.ts';
import { AuthorizationStatus } from '../../entities/source-document.ts';
import { Ack, EmptyPayload, MAX_IDS_PER_REQUEST, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * sources.*：專案資料夾與授權集合（F03、R4；P1-T021）。
 * 資料夾只能由 helper 開系統選取器加入（ADR-0003）；完整路徑只留在 helper，
 * 瀏覽器端只拿到不透明 ID 與名稱。請求只帶 helper 配發的 ID。
 * （鍵名用 root／entry，不用 folder／file／path，配合 contracts 的禁用鍵名檢查。）
 */

/** 一個已加入的資料夾。 */
export const SourceRoot = z.strictObject({
  rootId: Id,
  /** 資料夾名稱（只有最後一段，不含上層路徑） */
  name: NonEmptyText,
});
export type SourceRoot = z.infer<typeof SourceRoot>;

/** 資料夾清單的一列：含待確認與已授權數量。 */
export const SourceRootView = SourceRoot.extend({
  pendingCount: z.int().min(0),
  authorizedCount: z.int().min(0),
});
export type SourceRootView = z.infer<typeof SourceRootView>;

/**
 * 預覽中的一個項目（R4：只列名稱、大小、類型）。以 parentEntryId 組成樹，不傳路徑字串。
 * 文件有授權狀態：待確認／已授權／已撤銷；子資料夾沒有。
 */
export const SourceEntry = z.strictObject({
  entryId: Id,
  parentEntryId: Id.nullable(),
  name: NonEmptyText,
  kind: z.enum(['document', 'container']),
  sizeBytes: z.int().min(0).nullable(),
  /** 文件類型（副檔名，不含點；沒有則空字串） */
  format: z.string(),
  authorization: AuthorizationStatus.nullable(),
  /** 是否為優先納入的文件（README、規格、task 清單等，F03） */
  suggested: z.boolean(),
});
export type SourceEntry = z.infer<typeof SourceEntry>;

const RootRef = z.strictObject({ rootId: OpaqueId });
const IdList = z.array(OpaqueId).max(MAX_IDS_PER_REQUEST);

export const SOURCES_SCHEMAS = {
  /** helper 開系統資料夾選取器（可連續新增）；使用者取消回 cancelled。 */
  'sources.pick_folders': {
    request: bridgeOp('sources.pick_folders', EmptyPayload),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        selection: z.discriminatedUnion('status', [
          z.strictObject({ status: z.literal('selected'), roots: z.array(SourceRoot).min(1) }),
          z.strictObject({ status: z.literal('cancelled') }),
        ]),
      }),
    ),
  },
  /** 列出已加入的資料夾。 */
  'sources.list_folders': {
    request: bridgeOp('sources.list_folders', EmptyPayload),
    response: withFailure(z.strictObject({ ok: z.literal(true), roots: z.array(SourceRootView) })),
  },
  /**
   * 重新列舉並預覽一個資料夾（只列不讀內容）。新出現的候選文件為「待確認」（增量更新，R4）。
   */
  'sources.preview': {
    request: bridgeOp('sources.preview', RootRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), entries: z.array(SourceEntry) })),
  },
  /**
   * 勾選授權／取消授權。只能指向該資料夾預覽回傳過的項目；同一 ID 不得同時出現在兩邊。
   * 取消後立即停止讀取（R4）。
   */
  'sources.update_authorization': {
    request: bridgeOp(
      'sources.update_authorization',
      z
        .strictObject({ rootId: OpaqueId, authorize: IdList, revoke: IdList })
        .refine((p) => p.authorize.length + p.revoke.length > 0, { message: '至少要有一項' })
        .refine((p) => !p.authorize.some((id) => p.revoke.includes(id)), {
          message: '同一項目不得同時授權與撤銷',
        }),
    ),
    response: withFailure(Ack),
  },
  /** 移除資料夾：其下文件全部撤銷授權並停止讀取（R4）。 */
  'sources.remove_folder': {
    request: bridgeOp('sources.remove_folder', RootRef),
    response: withFailure(Ack),
  },
} as const;
