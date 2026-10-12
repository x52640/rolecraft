import type { DatabaseSync } from 'node:sqlite';

import { Photo, PhotoFormat } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';
import { newId, nowTimestamp, sha256Hex } from '../ids.ts';

/**
 * 目前的照片（D28；resume-output「照片」）：資料庫只存一張，不放檔案儲存區。
 * 照片印進匯出 PDF 後就是素材（D19），所以這裡只有讀與「沒有照片時加入」；
 * 刪除與更換只走 removePhoto／replacePhoto（application/photo-material.ts），才會套 D19。
 */

/** 加入時由呼叫端（helper 處理完影像）提供的內容；照片 ID、雜湊、時間由 storage 產生。 */
export interface PhotoInput {
  format: PhotoFormat;
  width: number;
  height: number;
  /** 重新編碼、去掉中繼資料後的 JPEG 位元組 */
  content: Uint8Array;
}

export interface StoredPhoto {
  photo: Photo;
  content: Uint8Array;
  createdAt: string;
}

export interface PhotoRepository {
  /** 目前照片；沒有為 null */
  get(): StoredPhoto | null;
  /** 沒有照片時加入（配發新照片 ID）；已有照片拋 StorageError（更換走 replacePhoto） */
  add(input: PhotoInput): StoredPhoto;
}

export function readCurrentPhoto(db: DatabaseSync): StoredPhoto | null {
  const row = db
    .prepare('SELECT id, format, width, height, sha256, content, created_at FROM photos')
    .get();
  if (!row) return null;
  const parsed = Photo.safeParse({
    id: row.id,
    format: row.format,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
  });
  if (!parsed.success || !(row.content instanceof Uint8Array)) {
    throw new StorageError(`photos[${String(row.id)}] 資料不符合格式`);
  }
  return { photo: parsed.data, content: row.content, createdAt: String(row.created_at) };
}

/** 寫入一張新照片（呼叫端負責「目前沒有照片」或已在同一交易刪掉舊的）。 */
export function insertPhoto(db: DatabaseSync, input: PhotoInput): StoredPhoto {
  if (input.content.length === 0) throw new StorageError('照片內容是空的');
  const parsed = Photo.safeParse({
    id: newId(),
    format: input.format,
    width: input.width,
    height: input.height,
    sha256: sha256Hex(input.content),
  });
  if (!parsed.success) throw new StorageError('照片資訊不符合格式', { cause: parsed.error });
  const photo = parsed.data;
  const createdAt = nowTimestamp();
  const content = Uint8Array.from(input.content);
  db.prepare(
    `INSERT INTO photos (id, format, width, height, sha256, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(photo.id, photo.format, photo.width, photo.height, photo.sha256, content, createdAt);
  return { photo, content, createdAt };
}

export function createPhotoRepository(db: DatabaseSync): PhotoRepository {
  return {
    get: () => readCurrentPhoto(db),
    add(input) {
      if (readCurrentPhoto(db) !== null) {
        throw new StorageError('已有照片；更換照片要走 replacePhoto（套 D19）');
      }
      return insertPhoto(db, input);
    },
  };
}
