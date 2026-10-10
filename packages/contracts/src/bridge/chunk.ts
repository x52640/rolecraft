import { z } from 'zod';

import { Sha256Hash } from '../entities/common.ts';

/**
 * 大回應分塊（P1-T041，bridge.md「分塊」）。
 * Native Messaging host→瀏覽器單則上限 1 MB，所以 PDF 等二進位內容不放進單一回應，
 * 而是由呼叫端逐塊讀：每塊是一則獨立請求（各有自己的請求 id），回應帶第幾塊、共幾塊與整份雜湊。
 * 內容不可變（例如匯出版本），所以逐塊讀不需要伺服器端狀態；呼叫端拼完後用 sha256 驗整份。
 */

/** 每塊原始位元組上限。base64 後約 683 KB，加上信封仍遠低於 1 MB。 */
export const BRIDGE_CHUNK_BYTES = 512 * 1024;

/** 單一內容的塊數上限（約 64 MB），超過一律拒絕而不是無限讀。 */
export const BRIDGE_MAX_CHUNKS = 128;

/** 請求中的塊序號：從 0 開始。 */
export const ChunkIndex = z
  .int()
  .min(0)
  .max(BRIDGE_MAX_CHUNKS - 1);

/** base64 編碼後的長度上限。 */
const MAX_CHUNK_BASE64 = Math.ceil(BRIDGE_CHUNK_BYTES / 3) * 4;

/** 一塊內容。index < total；data 是該塊原始位元組的 base64。 */
export const BinaryChunk = z
  .strictObject({
    index: ChunkIndex,
    total: z.int().min(1).max(BRIDGE_MAX_CHUNKS),
    /** 整份內容的位元組數 */
    totalBytes: z.int().min(0),
    /** 整份內容的 SHA-256；拼完後必須相符 */
    sha256: Sha256Hash,
    data: z.base64().max(MAX_CHUNK_BASE64),
  })
  .refine((c) => c.index < c.total, { path: ['index'], message: '塊序號超出總塊數' })
  .refine((c) => c.totalBytes <= c.total * BRIDGE_CHUNK_BYTES, {
    path: ['totalBytes'],
    message: '總位元組數與塊數不符',
  });
export type BinaryChunk = z.infer<typeof BinaryChunk>;
