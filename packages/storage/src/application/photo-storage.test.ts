import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { photoInput } from '../__fixtures__/photo.ts';
import { tempDatabase } from '../__fixtures__/entities.ts';
import { StorageError } from '../errors.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import { sha256Hex } from '../ids.ts';
import { loadMigrations, migrate } from '../migrate.ts';
import { ORPHAN_PDF_GRACE_MS, sweepStorage } from './storage-sweep.ts';

/** P1-T082：目前照片的保存、孤兒清掃不碰照片、migration 升級既有資料庫。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

describe('photo repository', () => {
  it('stores one current photo in the database with storage-assigned id and hash', () => {
    expect(t.repos.photos.get()).toBeNull();
    const input = photoInput();
    const stored = t.repos.photos.add(input);
    expect(stored.photo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.photo).toEqual({
      id: stored.photo.id,
      format: 'jpeg',
      width: 600,
      height: 800,
      sha256: sha256Hex(input.content),
    });
    expect(t.repos.photos.get()).toEqual(stored);
    expect([...(t.repos.photos.get()?.content ?? [])]).toEqual([...input.content]);
  });

  it('allows at most one photo and exposes no delete', () => {
    t.repos.photos.add(photoInput());
    expect(() => t.repos.photos.add(photoInput('b'))).toThrow(StorageError);
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO photos (id, format, width, height, sha256, content, created_at)
           VALUES ('x', 'jpeg', 1, 1, ?, x'01', 't')`,
        )
        .run('a'.repeat(64)),
    ).toThrow(/UNIQUE/);
    expect(Object.keys(t.repos.photos)).not.toContain('delete');
  });

  it('rejects empty content and out-of-range sizes', () => {
    expect(() => t.repos.photos.add(photoInput('a', { content: new Uint8Array() }))).toThrow(
      StorageError,
    );
    expect(() => t.repos.photos.add(photoInput('a', { height: 0 }))).toThrow(StorageError);
    expect(t.repos.photos.get()).toBeNull();
  });

  it('keeps a photo immutable and never reuses a deleted id', () => {
    const stored = t.repos.photos.add(photoInput());
    expect(() => t.db.prepare('UPDATE photos SET width = 1').run()).toThrow(/immutable/);
    t.db.prepare('DELETE FROM photos').run();
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO photos (id, format, width, height, sha256, content, created_at)
           VALUES (?, 'jpeg', 1, 1, ?, x'01', 't')`,
        )
        .run(stored.photo.id, stored.photo.sha256),
    ).toThrow(/cannot be reused/);
  });
});

describe('sweeps and the file store', () => {
  it('never puts the photo in the file store, so the orphan sweep cannot touch it', () => {
    const stored = t.repos.photos.add(photoInput());
    const now = () => Date.now() + ORPHAN_PDF_GRACE_MS + 60_000;
    sweepStorage(t.db, t.files, { orphanGrace: true, now });
    sweepStorage(t.db, t.files);
    expect(t.repos.photos.get()).toEqual(stored);
    expect(fileStoreInternals(t.files).listHashes()).not.toContain(stored.photo.sha256);
  });

  it('purges unapplied versions holding a photo deleted by raw SQL (defense in depth)', () => {
    const stored = t.repos.photos.add(photoInput());
    const photo = { photoId: stored.photo.id, sha256: stored.photo.sha256 };
    const unapplied = t.exports.create({ ...t.exportInput(), photo }, t.pdf());
    const applied = t.exports.create({ ...t.exportInput(), photo }, t.pdf());
    t.apply(applied);
    t.db.prepare('DELETE FROM photos').run();

    expect(sweepStorage(t.db, t.files)).toEqual({
      purgedExportVersionIds: [unapplied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.exports.get(applied.id)).not.toBeNull();
  });
});

describe('migration 0009 on an existing database', () => {
  it('upgrades a pre-photo database and keeps existing deletion records and triggers', () => {
    const old = tempDatabase({ migrations: loadMigrations().filter((m) => m.version < 9) });
    try {
      const { db } = old;
      db.prepare(
        "INSERT INTO deleted_materials (kind, material_id, deleted_at) VALUES ('claim', 'c-old', 't')",
      ).run();
      db.prepare(
        `INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data)
         VALUES ('ev-old', 'rv', 't', 'h', json_object('id', 'ev-old', 'resumeVersionId', 'rv', 'pdfHash', 'h'))`,
      ).run();

      expect(migrate(db).applied).toEqual([9]);

      expect(db.prepare('SELECT kind, material_id FROM deleted_materials').all()).toEqual([
        { kind: 'claim', material_id: 'c-old' },
      ]);
      expect(
        db.prepare("SELECT photo_id, photo_sha256 FROM export_versions WHERE id = 'ev-old'").get(),
      ).toEqual({ photo_id: null, photo_sha256: null });
      expect(() => assertImmutabilityGuards(db)).not.toThrow();
      db.prepare(
        "INSERT INTO deleted_materials (kind, material_id, deleted_at) VALUES ('photo', 'p', 't')",
      ).run();
      expect(() =>
        db
          .prepare(
            "INSERT INTO deleted_materials (kind, material_id, deleted_at) VALUES ('other', 'x', 't')",
          )
          .run(),
      ).toThrow(/CHECK/);
    } finally {
      old.cleanup();
    }
  });

  it('records generated photo columns for new export versions', () => {
    const stored = t.repos.photos.add(photoInput());
    const photo = { photoId: stored.photo.id, sha256: stored.photo.sha256 };
    const version = t.exports.create({ ...t.exportInput(), photo }, t.pdf());
    expect(
      t.db
        .prepare('SELECT photo_id, photo_sha256 FROM export_versions WHERE id = ?')
        .get(version.id),
    ).toEqual({ photo_id: stored.photo.id, photo_sha256: stored.photo.sha256 });
  });
});
