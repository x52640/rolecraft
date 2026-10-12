import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExportVersion } from '@rolecraft/contracts';

import { photoInput } from '../__fixtures__/photo.ts';
import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import type { StoredPhoto } from '../repositories/photo-repository.ts';
import { readInterviewInput } from './interview-input.ts';
import { isMaterialDeleted } from './materials.ts';
import { removePhoto, replacePhoto } from './photo-material.ts';

/** P1-T082：照片是素材，刪除與更換套 D19（resume-output「照片」）。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const fileHashes = () => fileStoreInternals(t.files).listHashes().sort();
const pending = () => t.db.prepare('SELECT pdf_hash FROM pending_pdf_deletions').all();
const deletedRows = () =>
  t.db.prepare('SELECT kind, material_id FROM deleted_materials ORDER BY kind').all();

const exportWith = (stored: StoredPhoto | null, label?: string): ExportVersion =>
  t.exports.create(
    {
      ...t.exportInput(),
      ...(stored ? { photo: { photoId: stored.photo.id, sha256: stored.photo.sha256 } } : {}),
    },
    t.pdf(label),
  );

/** 一張照片＋三個匯出版本：含照未投遞、含照已投遞、不含照 */
function setup() {
  const stored = t.repos.photos.add(photoInput());
  const unapplied = exportWith(stored);
  const applied = exportWith(stored);
  const record = t.apply(applied);
  const withoutPhoto = exportWith(null);
  return { stored, unapplied, applied, record, withoutPhoto };
}

describe('removePhoto (D19)', () => {
  it('deletes unapplied versions holding the photo and their PDFs, keeps applied ones disclosed', () => {
    const { stored, unapplied, applied, record, withoutPhoto } = setup();

    const result = removePhoto(t.db, t.files);

    expect(result).toEqual({
      removedPhotoId: stored.photo.id,
      materialDeleted: true,
      deletedExportVersionIds: [unapplied.id],
      retainedExportVersionIds: [applied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.repos.photos.get()).toBeNull();
    expect(t.exports.get(unapplied.id)).toBeNull();
    expect(t.exports.get(applied.id)).not.toBeNull();
    expect(t.exports.get(withoutPhoto.id)).not.toBeNull();
    expect(fileHashes()).toEqual([applied.pdfHash, withoutPhoto.pdfHash].sort());
    expect(pending()).toEqual([]);
    expect(isMaterialDeleted(t.db, { kind: 'photo', id: stored.photo.id })).toBe(true);
    // 已投遞版本明示含已刪照片
    expect(readInterviewInput(t.db, t.files, record.id).deletedMaterials).toEqual([
      { kind: 'photo', id: stored.photo.id },
    ]);
    // 之後刪掉投遞紀錄，保留的版本照 D19 一併刪除
    expect(t.applications.delete(record.id).purgedExportVersionIds).toEqual([applied.id]);
  });

  it('does nothing when there is no photo', () => {
    const before = t.exportNow();
    expect(removePhoto(t.db, t.files)).toEqual({
      removedPhotoId: null,
      materialDeleted: false,
      deletedExportVersionIds: [],
      retainedExportVersionIds: [],
      releasedPdfHashes: [],
    });
    expect(t.exports.get(before.id)).not.toBeNull();
    expect(deletedRows()).toEqual([]);
  });

  it('refuses to run inside an outer transaction', () => {
    t.repos.photos.add(photoInput());
    t.db.exec('BEGIN');
    try {
      expect(() => removePhoto(t.db, t.files)).toThrow(StorageError);
    } finally {
      t.db.exec('ROLLBACK');
    }
  });
});

describe('replacePhoto (D19, one transaction)', () => {
  it('treats replacement as deleting the old photo and adds the new one with a new id', () => {
    const { stored, unapplied, applied, withoutPhoto } = setup();

    const result = replacePhoto(t.db, t.files, photoInput('photo-b'));

    expect(result.photo.id).not.toBe(stored.photo.id);
    expect(result).toMatchObject({
      removedPhotoId: stored.photo.id,
      deletedExportVersionIds: [unapplied.id],
      retainedExportVersionIds: [applied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.repos.photos.get()?.photo).toEqual(result.photo);
    expect(t.exports.get(withoutPhoto.id)).not.toBeNull();
    expect(isMaterialDeleted(t.db, { kind: 'photo', id: stored.photo.id })).toBe(true);
    expect(isMaterialDeleted(t.db, { kind: 'photo', id: result.photo.id })).toBe(false);
  });

  it('is an add when there is no photo yet', () => {
    const result = replacePhoto(t.db, t.files, photoInput());
    expect(result.removedPhotoId).toBeNull();
    expect(result.deletedExportVersionIds).toEqual([]);
    expect(t.repos.photos.get()?.photo).toEqual(result.photo);
  });

  it('leaves everything unchanged when writing the new photo fails midway', () => {
    const { stored, unapplied, applied } = setup();
    const filesBefore = fileHashes();
    t.db.exec(`CREATE TEMP TRIGGER fail_photo_insert BEFORE INSERT ON photos
      BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);

    expect(() => replacePhoto(t.db, t.files, photoInput('photo-b'))).toThrow(/simulated failure/);

    expect(t.repos.photos.get()).toEqual(stored);
    expect(t.exports.get(unapplied.id)).not.toBeNull();
    expect(t.exports.get(applied.id)).not.toBeNull();
    expect(fileHashes()).toEqual(filesBefore);
    expect(pending()).toEqual([]);
    expect(deletedRows()).toEqual([]);
  });

  it('rejects invalid input before touching the old photo', () => {
    const { stored, unapplied } = setup();
    expect(() => replacePhoto(t.db, t.files, photoInput('big', { width: 5000 }))).toThrow(
      StorageError,
    );
    expect(t.repos.photos.get()).toEqual(stored);
    expect(t.exports.get(unapplied.id)).not.toBeNull();
  });
});

describe('re-adding the same photo after deletion (W12)', () => {
  it('gets a new id and new exports are not blocked; the deleted id stays blocked', () => {
    const first = t.repos.photos.add(photoInput());
    removePhoto(t.db, t.files);

    const again = t.repos.photos.add(photoInput());
    expect(again.photo.sha256).toBe(first.photo.sha256);
    expect(again.photo.id).not.toBe(first.photo.id);
    expect(exportWith(again).photo).toEqual({
      photoId: again.photo.id,
      sha256: again.photo.sha256,
    });

    expect(() => exportWith(first)).toThrow(/已刪除的素材.*photo:/);
  });

  it('blocks a deleted photo id at the database layer too', () => {
    const first = t.repos.photos.add(photoInput());
    const version = exportWith(first);
    removePhoto(t.db, t.files);
    const data = JSON.stringify({ ...version, id: 'raw-1' });
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data)
           VALUES ('raw-1', ?, ?, ?, ?)`,
        )
        .run(version.resumeVersionId, version.exportedAt, version.pdfHash, data),
    ).toThrow(/deleted photo/);
  });

  it('rejects an export whose photo is unknown or does not match the current photo', () => {
    const stored = t.repos.photos.add(photoInput());
    const base = t.exportInput();
    expect(() =>
      t.exports.create(
        { ...base, photo: { photoId: 'nope', sha256: stored.photo.sha256 } },
        t.pdf(),
      ),
    ).toThrow(/不是目前的照片/);
    expect(() =>
      t.exports.create(
        { ...base, photo: { photoId: stored.photo.id, sha256: 'f'.repeat(64) } },
        t.pdf(),
      ),
    ).toThrow(/不是目前的照片/);
    expect(fileHashes()).toEqual([]);
  });
});
