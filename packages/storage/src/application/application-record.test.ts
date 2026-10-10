import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { transaction } from '../transaction.ts';
import { deleteMaterial } from './material-deletion.ts';

let t: ReturnType<typeof exportTestbed>;

beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const insertRecord = (id: string, exportVersionId: string, verb = 'INSERT') =>
  t.db
    .prepare(
      `${verb} INTO application_records (id, export_version_id, applied_at, data) VALUES (?, ?, ?, ?)`,
    )
    .run(
      id,
      exportVersionId,
      '2026-10-11T09:00:00.000Z',
      JSON.stringify({
        id,
        initiation: 'invited',
        appliedAt: '2026-10-11T09:00:00.000Z',
        status: '已投遞',
        exportVersionId,
      }),
    );

describe('ApplicationRecord only points to an existing export version', () => {
  it('create, update fields, list', () => {
    const v = t.exportNow();
    const a = t.apply(v);
    expect(t.applications.get(a.id)).toEqual(a);
    expect(t.exports.isApplied(v.id)).toBe(true);
    const updated = t.applications.update(a.id, { status: '已面試', initiation: 'invited' });
    expect(updated).toEqual({ ...a, status: '已面試', initiation: 'invited' });
    expect(t.applications.listByExportVersion(v.id)).toEqual([updated]);
  });

  it('rejects missing ids and non-export ids (resume version, job snapshot, claim)', () => {
    t.exportNow();
    for (const id of ['missing', t.resume.id, t.job.id, t.fact.id]) {
      expect(() => t.apply({ ...t.exportNow(), id })).toThrow(StorageError);
    }
  });

  it('raw SQL insert to a non-export id is rejected even with foreign keys off', () => {
    t.db.exec('PRAGMA foreign_keys = OFF');
    expect(() => insertRecord('a-1', t.resume.id)).toThrow(/existing export version/);
    expect(() => insertRecord('a-2', 'missing')).toThrow(/existing export version/);
  });

  it('cannot be re-pointed to another export version', () => {
    const v1 = t.exportNow();
    const v2 = t.exportNow();
    const a = t.apply(v1);
    expect(() =>
      t.db
        .prepare('UPDATE application_records SET export_version_id = ? WHERE id = ?')
        .run(v2.id, a.id),
    ).toThrow(/fixed/);
    expect(() => insertRecord(a.id, v2.id, 'INSERT OR REPLACE')).toThrow(/already exists/);
    expect(() => insertRecord(a.id, v2.id, 'REPLACE')).toThrow(/already exists/);
    expect(t.applications.get(a.id)?.exportVersionId).toBe(v1.id);
  });
});

describe('D19 deleting material', () => {
  it('deletes unapplied versions with their PDF, retains applied ones', () => {
    const unapplied = t.exportNow();
    const applied = t.exportNow();
    t.apply(applied);
    const result = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(result).toEqual({
      materialDeleted: true,
      deletedExportVersionIds: [unapplied.id],
      retainedExportVersionIds: [applied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.repos.claims.get(t.fact.id)).toBeNull();
    expect(t.exports.get(unapplied.id)).toBeNull();
    expect(t.files.has(unapplied.pdfHash)).toBe(false);
    expect(t.exports.get(applied.id)).toEqual(applied);
    expect(t.exports.readPdf(applied)).toEqual(t.files.get(applied.pdfHash));
  });

  it('matches every material kind', () => {
    for (const kind of ['claim', 'source_document', 'resume_version', 'job_snapshot'] as const) {
      t.cleanup();
      t = exportTestbed();
      const v = t.exportNow();
      const ids = {
        claim: t.fact.id,
        source_document: t.source.id,
        resume_version: t.resume.id,
        job_snapshot: t.job.id,
      };
      if (kind === 'job_snapshot') t.repos.resumeVersions.delete(t.resume.id);
      const result = deleteMaterial(t.db, t.files, { kind, id: ids[kind] });
      expect(result.materialDeleted, kind).toBe(true);
      expect(result.deletedExportVersionIds, kind).toEqual([v.id]);
    }
  });

  it('keeps a PDF that another remaining version still uses', () => {
    const shared = t.pdf('same');
    const a = t.exports.create(t.exportInput(), shared);
    const b = t.exports.create(t.exportInput(), shared);
    t.apply(b);
    const result = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(result.deletedExportVersionIds).toEqual([a.id]);
    expect(result.releasedPdfHashes).toEqual([]);
    expect(t.exports.readPdf(b)).toEqual(shared);
  });

  it('boundary: applied then application deleted before material deletion → whole version deleted', () => {
    const v = t.exportNow();
    const a = t.apply(v);
    expect(t.applications.delete(a.id)).toEqual({
      deleted: true,
      purgedExportVersionIds: [],
      releasedPdfHashes: [],
    });
    expect(t.exports.get(v.id)).toEqual(v); // 沒刪素材，版本仍在
    const result = deleteMaterial(t.db, t.files, { kind: 'source_document', id: t.source.id });
    expect(result.deletedExportVersionIds).toEqual([v.id]);
    expect(result.retainedExportVersionIds).toEqual([]);
  });

  it('boundary: retained version is purged once its last application record is deleted', () => {
    const v = t.exportNow();
    const a1 = t.apply(v);
    const a2 = t.apply(v);
    expect(deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id })).toMatchObject({
      retainedExportVersionIds: [v.id],
    });
    expect(t.applications.delete(a1.id).purgedExportVersionIds).toEqual([]);
    expect(t.exports.get(v.id)).toEqual(v); // 仍被 a2 投遞
    expect(t.applications.delete(a2.id)).toEqual({
      deleted: true,
      purgedExportVersionIds: [v.id],
      releasedPdfHashes: [v.pdfHash],
    });
    expect(t.exports.get(v.id)).toBeNull();
    expect(t.files.has(v.pdfHash)).toBe(false);
    expect(t.applications.delete(a2.id).deleted).toBe(false);
  });

  it('rolls back everything when the material is still referenced by a foreign key', () => {
    const v = t.exportNow();
    expect(() => deleteMaterial(t.db, t.files, { kind: 'job_snapshot', id: t.job.id })).toThrow(
      /FOREIGN KEY/,
    );
    expect(t.exports.get(v.id)).toEqual(v);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM deleted_materials').get()?.n).toBe(0);
  });

  it('refuses to run inside an outer transaction (file deletion cannot roll back)', () => {
    const v = t.exportNow();
    const a = t.apply(v);
    transaction(t.db, () => {
      expect(() => deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id })).toThrow(
        StorageError,
      );
      expect(() => t.applications.delete(a.id)).toThrow(StorageError);
    });
  });
});
