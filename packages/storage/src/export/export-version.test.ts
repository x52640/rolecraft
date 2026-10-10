import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../errors.ts';
import { sha256Hex } from '../ids.ts';
import { exportTestbed } from './fixtures.test-support.ts';
import { createExportVersionRepository } from './export-version-repository.ts';

let t: ReturnType<typeof exportTestbed>;

beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const rawRow = (id: string) =>
  t.db.prepare('SELECT * FROM export_versions WHERE id = ?').get(id) as Record<string, unknown>;

describe('ExportVersion create and read', () => {
  it('stores PDF, assigns id/time/hash and copies source document ids', () => {
    const pdf = t.pdf('a');
    const v = t.exports.create(t.exportInput(), pdf);
    expect(v.pdfHash).toBe(sha256Hex(pdf));
    expect(v.sourceDocumentIds).toEqual([t.source.id]);
    expect(t.exports.get(v.id)).toEqual(v);
    expect(t.exports.readPdf(v)).toEqual(pdf);
    expect(t.exports.listByResumeVersion(t.resume.id)).toEqual([v]);
    expect(t.exports.list()).toEqual([v]);
    expect(t.exports.isApplied(v.id)).toBe(false);
  });

  it('rejects invalid content and leaves no orphan PDF', () => {
    const pdf = t.pdf('bad');
    expect(() => t.exports.create({ ...t.exportInput(), resumeVersionId: '' }, pdf)).toThrow();
    expect(t.files.has(sha256Hex(pdf))).toBe(false);
  });

  it('has no update method', () => {
    expect(Object.keys(t.exports)).not.toContain('update');
    expect(Object.keys(t.exports)).not.toContain('save');
  });
});

describe('database layer blocks modification with raw SQL', () => {
  it('UPDATE of any column (incl. UPDATE OR REPLACE and upsert) is rejected', () => {
    const v = t.exportNow();
    const before = rawRow(v.id);
    const attempts = [
      `UPDATE export_versions SET data = json_set(data, '$.sections', json('[]')) WHERE id = '${v.id}'`,
      `UPDATE export_versions SET exported_at = '2000-01-01T00:00:00.000Z'`,
      `UPDATE export_versions SET id = 'other' WHERE id = '${v.id}'`,
      `UPDATE OR REPLACE export_versions SET pdf_hash = 'x'`,
      `INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data)
         SELECT id, resume_version_id, exported_at, pdf_hash, data FROM export_versions WHERE true
         ON CONFLICT (id) DO UPDATE SET exported_at = 'x'`,
    ];
    for (const sql of attempts) expect(() => t.db.exec(sql), sql).toThrow(/immutable/);
    expect(rawRow(v.id)).toEqual(before);
  });

  it('INSERT OR REPLACE / REPLACE INTO with an existing id is rejected', () => {
    const v = t.exportNow();
    const before = rawRow(v.id);
    const forged = JSON.stringify({ ...v, sections: [] });
    for (const verb of ['INSERT OR REPLACE', 'REPLACE']) {
      expect(() =>
        t.db
          .prepare(
            `${verb} INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(v.id, v.resumeVersionId, v.exportedAt, v.pdfHash, forged),
      ).toThrow(/immutable/);
    }
    expect(rawRow(v.id)).toEqual(before);
  });

  it('re-creating a deleted version with the same id is rejected; ledger is append-only', () => {
    const v = t.exportNow();
    const row = rawRow(v.id);
    t.db.prepare('DELETE FROM export_versions WHERE id = ?').run(v.id);
    expect(() =>
      t.db
        .prepare(
          'INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          v.id,
          String(row.resume_version_id),
          String(row.exported_at),
          String(row.pdf_hash),
          String(row.data),
        ),
    ).toThrow(/immutable/);
    expect(() => t.db.exec('DELETE FROM export_version_ledger')).toThrow(/append-only/);
    expect(() => t.db.exec("UPDATE export_version_ledger SET id = 'z'")).toThrow(/append-only/);
  });

  it('applied version cannot be deleted even with foreign keys off', () => {
    const v = t.exportNow();
    t.apply(v);
    t.db.exec('PRAGMA foreign_keys = OFF');
    expect(() => t.db.prepare('DELETE FROM export_versions WHERE id = ?').run(v.id)).toThrow(
      /referenced by an application record/,
    );
    expect(() => t.db.exec('DELETE FROM export_versions')).toThrow(/referenced/);
    expect(t.exports.get(v.id)).toEqual(v);
  });

  it('index columns must match the JSON data', () => {
    const v = t.exportNow();
    expect(() =>
      t.db
        .prepare(
          'INSERT INTO export_versions (id, resume_version_id, exported_at, pdf_hash, data) VALUES (?, ?, ?, ?, ?)',
        )
        .run('new-id', v.resumeVersionId, v.exportedAt, v.pdfHash, JSON.stringify(v)),
    ).toThrow(/CHECK/);
  });

  it('refuses to open when an immutability trigger was dropped', () => {
    t.db.exec('DROP TRIGGER export_versions_no_update');
    expect(() => createExportVersionRepository(t.db, t.files)).toThrow(StorageError);
  });
});
