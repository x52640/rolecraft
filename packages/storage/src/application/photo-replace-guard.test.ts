import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { photoInput } from '../__fixtures__/photo.ts';
import { tempDatabase } from '../__fixtures__/entities.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { loadMigrations, migrate } from '../migrate.ts';
import { isMaterialDeleted } from './materials.ts';
import { replacePhoto } from './photo-material.ts';

/** P1-T082 審查：INSERT OR REPLACE 不能繞過照片的 D19 刪除（migration 0010）。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const replaceSql = `INSERT OR REPLACE INTO photos (id, format, width, height, sha256, content, created_at)
  VALUES (?, 'jpeg', 1, 1, ?, x'01', 't')`;

function setup() {
  const stored = t.repos.photos.add(photoInput());
  const photo = { photoId: stored.photo.id, sha256: stored.photo.sha256 };
  const unapplied = t.exports.create({ ...t.exportInput(), photo }, t.pdf());
  return { stored, unapplied };
}

describe('REPLACE cannot overwrite the current photo', () => {
  it('rejects REPLACE with the same photo id', () => {
    const { stored, unapplied } = setup();
    expect(t.db.prepare('PRAGMA recursive_triggers').get()).toEqual({ recursive_triggers: 0 });
    expect(() => t.db.prepare(replaceSql).run(stored.photo.id, 'b'.repeat(64))).toThrow(
      /already exists/,
    );
    expect(t.repos.photos.get()).toEqual(stored);
    expect(t.exports.get(unapplied.id)).not.toBeNull();
  });

  it('rejects REPLACE that collides only on the slot', () => {
    const { stored, unapplied } = setup();
    expect(() => t.db.prepare(replaceSql).run('other-id', 'b'.repeat(64))).toThrow(
      /already exists/,
    );
    expect(t.repos.photos.get()).toEqual(stored);
    expect(t.exports.get(unapplied.id)).not.toBeNull();
    expect(isMaterialDeleted(t.db, { kind: 'photo', id: stored.photo.id })).toBe(false);
  });

  it('still lets replacePhoto delete the old photo first and add the new one', () => {
    const { stored, unapplied } = setup();
    const result = replacePhoto(t.db, t.files, photoInput('photo-b'));
    expect(result.deletedExportVersionIds).toEqual([unapplied.id]);
    expect(t.repos.photos.get()?.photo).toEqual(result.photo);
    expect(isMaterialDeleted(t.db, { kind: 'photo', id: stored.photo.id })).toBe(true);
  });
});

describe('migration 0010', () => {
  it('upgrades a 0009 database holding a photo and then blocks REPLACE', () => {
    const old = tempDatabase({ migrations: loadMigrations().filter((m) => m.version <= 9) });
    try {
      const { db } = old;
      db.prepare(
        `INSERT INTO photos (id, format, width, height, sha256, content, created_at)
         VALUES ('p-old', 'jpeg', 1, 1, ?, x'01', 't')`,
      ).run('a'.repeat(64));

      expect(migrate(db).applied).toEqual([10]);

      expect(() => assertImmutabilityGuards(db)).not.toThrow();
      expect(() => db.prepare(replaceSql).run('p-old', 'b'.repeat(64))).toThrow(/already exists/);
      expect(db.prepare('SELECT id, sha256 FROM photos').all()).toEqual([
        { id: 'p-old', sha256: 'a'.repeat(64) },
      ]);
    } finally {
      old.cleanup();
    }
  });
});
