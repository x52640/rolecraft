import type { DatabaseSync } from 'node:sqlite';

import type { Photo } from '@rolecraft/contracts';

import { assertImmutabilityGuards } from '../export/guards.ts';
import { assertNotInTransaction } from '../export/pdf-cleanup.ts';
import type { FileStore } from '../files/file-store.ts';
import {
  insertPhoto,
  readCurrentPhoto,
  type PhotoInput,
} from '../repositories/photo-repository.ts';
import { transaction } from '../transaction.ts';
import {
  deleteMaterialRows,
  finishMaterialDeletion,
  type MaterialDeletion,
  type MaterialDeletionInTransaction,
} from './material-deletion.ts';

/**
 * 照片的刪除與更換（D19、D28；resume-output「照片」）。照片印進匯出 PDF 後就是素材：
 * 含這張照片、未投遞的匯出版本整份刪除（PDF 走待刪紀錄），已投遞的保留並明示。
 * 以照片 ID 記入已刪素材，不用雜湊：刪掉後再加入同一張照片（新照片 ID）不會被擋（W12）。
 * 兩者都不能在外層交易中呼叫（會刪 PDF 檔）。
 */

export interface PhotoRemoval extends MaterialDeletion {
  /** 被刪的照片 ID；原本沒有照片為 null（什麼都不動） */
  removedPhotoId: string | null;
}

export interface PhotoReplacement extends PhotoRemoval {
  /** 新的目前照片 */
  photo: Photo;
}

const NOTHING_REMOVED: MaterialDeletionInTransaction = {
  materialDeleted: false,
  deletedExportVersionIds: [],
  retainedExportVersionIds: [],
  pdfHashes: [],
};

/** 交易內：刪掉目前照片並套 D19；沒有照片時什麼都不動。 */
function removeCurrentRows(db: DatabaseSync): {
  removedPhotoId: string | null;
  rows: MaterialDeletionInTransaction;
} {
  const current = readCurrentPhoto(db);
  if (!current) return { removedPhotoId: null, rows: NOTHING_REMOVED };
  const rows = deleteMaterialRows(db, { kind: 'photo', id: current.photo.id });
  return { removedPhotoId: current.photo.id, rows };
}

/** 刪除目前照片（photo.remove）。 */
export function removePhoto(db: DatabaseSync, fileStore: FileStore): PhotoRemoval {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '刪除照片');
  const { removedPhotoId, rows } = transaction(db, () => removeCurrentRows(db));
  return { removedPhotoId, ...finishMaterialDeletion(db, fileStore, rows) };
}

/**
 * 更換照片＝刪除舊照片（套 D19）＋加入新照片（配發新照片 ID），同一交易完成：
 * 中途失敗（例如寫入新照片失敗）舊照片、匯出版本、已刪素材紀錄都不變。沒有舊照片時就是加入。
 */
export function replacePhoto(
  db: DatabaseSync,
  fileStore: FileStore,
  input: PhotoInput,
): PhotoReplacement {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '更換照片');
  const { removedPhotoId, rows, photo } = transaction(db, () => {
    const removed = removeCurrentRows(db);
    return { ...removed, photo: insertPhoto(db, input).photo };
  });
  return { photo, removedPhotoId, ...finishMaterialDeletion(db, fileStore, rows) };
}
