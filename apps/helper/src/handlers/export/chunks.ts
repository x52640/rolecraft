// export.read_pdf 的分塊（P1-T041 協定，bridge.md「分塊」）：內容不可變，所以每塊獨立計算、不留狀態。
import { BRIDGE_CHUNK_BYTES, BRIDGE_MAX_CHUNKS, type BinaryChunk } from '@rolecraft/contracts';
import { sha256Hex } from '@rolecraft/storage';

/** 這份內容要分幾塊（空內容也算 1 塊）。 */
export function chunkCount(byteLength: number): number {
  return Math.max(1, Math.ceil(byteLength / BRIDGE_CHUNK_BYTES));
}

/** 內容是否能用分塊協定傳完（超過 BRIDGE_MAX_CHUNKS 塊一律不收）。 */
export function fitsChunkLimit(byteLength: number): boolean {
  return chunkCount(byteLength) <= BRIDGE_MAX_CHUNKS;
}

/** 第 index 塊；超出範圍或內容超過上限回 null。 */
export function chunkOf(content: Uint8Array, index: number): BinaryChunk | null {
  const total = chunkCount(content.byteLength);
  if (!fitsChunkLimit(content.byteLength) || !Number.isInteger(index) || index < 0) return null;
  if (index >= total) return null;
  const start = index * BRIDGE_CHUNK_BYTES;
  const slice = content.subarray(start, start + BRIDGE_CHUNK_BYTES);
  return {
    index,
    total,
    totalBytes: content.byteLength,
    sha256: sha256Hex(content),
    data: Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('base64'),
  };
}
