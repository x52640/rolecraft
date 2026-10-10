import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../errors.ts';
import { sha256Hex } from '../ids.ts';
import { createLocalFileStore, fileStoreInternals, type FileStore } from './file-store.ts';

let root: string;
let store: FileStore;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'rolecraft-files-'));
  store = createLocalFileStore(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const pdf = new TextEncoder().encode('%PDF-1.7 fake');

describe('local file store', () => {
  it('stores content by SHA-256 and reads it back', () => {
    const stored = store.put(pdf);
    expect(stored).toEqual({ hash: sha256Hex(pdf), byteLength: pdf.byteLength });
    expect(store.has(stored.hash)).toBe(true);
    expect(store.get(stored.hash)).toEqual(pdf);
    expect(store.put(pdf)).toEqual(stored);
  });

  it('returns null / false for missing content', () => {
    const missing = 'f'.repeat(64);
    expect(store.get(missing)).toBeNull();
    expect(fileStoreInternals(store).delete(missing)).toBe(false);
  });

  it('has no public delete; internal delete and listing work', () => {
    expect(Object.keys(store).sort()).toEqual(['get', 'has', 'put']);
    const { hash } = store.put(pdf);
    expect(fileStoreInternals(store).listHashes()).toEqual([hash]);
    expect(fileStoreInternals(store).delete(hash)).toBe(true);
    expect(store.has(hash)).toBe(false);
    expect(fileStoreInternals(store).listHashes()).toEqual([]);
  });

  it('refuses internals of a store it did not create', () => {
    const fake: FileStore = {
      put: (content) => store.put(content),
      get: (hash) => store.get(hash),
      has: (hash) => store.has(hash),
    };
    expect(() => fileStoreInternals(fake)).toThrow(StorageError);
  });

  it('rejects malformed hashes (no path traversal)', () => {
    expect(() => store.get('../../etc/passwd')).toThrow(StorageError);
    expect(() => store.has('ABC')).toThrow(StorageError);
  });

  it('detects content modified outside RoleCraft', () => {
    const { hash } = store.put(pdf);
    writeFileSync(path.join(root, 'sha256', hash.slice(0, 2), hash), 'tampered');
    expect(() => store.get(hash)).toThrow(/雜湊不符/);
  });
});
