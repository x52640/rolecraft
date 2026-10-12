import { z } from 'zod';

import { Id, Sha256Hash } from './common.ts';

/**
 * 目前的照片（D28；resume-output「照片」）：資料區只存一張，獨立於 Profile。
 * helper 解碼後重新編碼成 JPEG、最長邊縮到 PHOTO_MAX_EDGE_PX、去掉全部中繼資料才存。
 * 素材身分是照片 ID（每次加入、更換都配發新的），不用雜湊當身分（W12）。照片不送模型。
 */

/** 存下的照片最長邊上限（px）。 */
export const PHOTO_MAX_EDGE_PX = 1200;

/** 選取的原始檔大小上限（10 MB）；只收 JPEG／PNG。 */
export const PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;

/** 存下的格式：一律重新編碼成 JPEG。 */
export const PhotoFormat = z.enum(['jpeg']);
export type PhotoFormat = z.infer<typeof PhotoFormat>;

const Edge = z.int().min(1).max(PHOTO_MAX_EDGE_PX);

export const Photo = z.strictObject({
  id: Id,
  format: PhotoFormat,
  width: Edge,
  height: Edge,
  /** 存下內容（重新編碼後）的 SHA-256 */
  sha256: Sha256Hash,
});
export type Photo = z.infer<typeof Photo>;
