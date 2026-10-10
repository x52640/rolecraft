import { describe, expect, it } from 'vitest';

import {
  classifyEntry,
  DEFAULT_MAX_FILE_BYTES,
  looksBinary,
  type FilterOptions,
} from './filter.ts';

const opts: FilterOptions = { maxFileBytes: DEFAULT_MAX_FILE_BYTES, customNames: [] };
const reasonOf = (rel: string, kind: 'file' | 'symlink' | 'other' = 'file', size = 10) => {
  const v = classifyEntry(rel, kind, size, opts);
  return v.eligible ? 'eligible' : v.reason;
};

describe('classifyEntry 文字文件白名單', () => {
  it.each(['README.md', 'docs/spec.md', 'notes.txt', 'guide.rst', 'a.adoc', 'README', 'TODO'])(
    '%s 是候選',
    (rel) => expect(reasonOf(rel)).toBe('eligible'),
  );

  it.each(['image.png', 'report.pdf', 'Makefile', 'Dockerfile', 'data.csv', 'page.mdx'])(
    '%s 不是文字文件或是會內嵌程式碼的格式',
    (rel) => expect(['not_text_document', 'source_code']).toContain(reasonOf(rel)),
  );
});

describe('原始碼與偽裝（D5）', () => {
  it.each(['src/index.ts', 'main.py', 'App.TSX', 'package.json', 'ci.yml', 'run.sh'])(
    '%s 是原始碼／設定',
    (rel) => expect(reasonOf(rel)).toBe('source_code'),
  );

  it.each(['main.py.txt', 'index.ts.md', 'server.JS.markdown', 'app.go.rst'])(
    '%s：把原始碼改名加上文字副檔名仍被排除',
    (rel) => expect(reasonOf(rel)).toBe('source_code'),
  );

  it('自訂檔名只影響優先序，不能把原始碼加進來', () => {
    const custom = { ...opts, customNames: ['main'] };
    expect(classifyEntry('main.py', 'file', 10, custom)).toEqual({
      eligible: false,
      reason: 'source_code',
    });
    expect(classifyEntry('MAIN.md', 'file', 10, custom)).toEqual({ eligible: true, priority: 1 });
  });
});

describe('隱藏檔與憑證', () => {
  it.each(['.env', '.env.local', '.npmrc', 'docs/.secret.md', '.github/README.md'])(
    '%s 是隱藏檔或在隱藏資料夾內',
    (rel) => expect(reasonOf(rel)).toBe('hidden'),
  );

  it.each([
    'server.pem',
    'tls.KEY',
    'id_rsa',
    'id_rsa.txt',
    'ID_ED25519.md',
    'secrets.md',
    'aws-credentials.txt',
    'api_key.txt',
    'passwords.md',
    'cert.p12.txt',
    'prod.env.md',
  ])('%s 是憑證類', (rel) => expect(reasonOf(rel)).toBe('credential'));
});

describe('相依、建置產物、大型檔、非一般檔', () => {
  it.each(['node_modules/x/README.md', 'dist/README.md', 'Build/notes.md', 'vendor/a/README'])(
    '%s 在排除資料夾內',
    (rel) => expect(reasonOf(rel)).toBe('excluded_directory'),
  );

  it('超過大小上限的文件被排除', () => {
    expect(reasonOf('README.md', 'file', DEFAULT_MAX_FILE_BYTES + 1)).toBe('too_large');
  });

  it('symlink 與其他種類不能成為候選', () => {
    expect(reasonOf('README.md', 'symlink')).toBe('symlink');
    expect(reasonOf('README.md', 'other')).toBe('not_regular_file');
  });
});

describe('路徑格式', () => {
  it.each([
    '../README.md',
    'docs/../../README.md',
    'docs/./README.md',
    '/etc/README.md',
    'docs//README.md',
    'docs\\README.md',
    'C:/README.md',
    'a\u0000.md',
    '',
  ])('%j 被拒', (rel) => expect(reasonOf(rel)).toBe('invalid_path'));
});

describe('優先序（大小寫不敏感）', () => {
  const prio = (rel: string) => {
    const v = classifyEntry(rel, 'file', 1, opts);
    return v.eligible ? v.priority : -1;
  };
  it('README > CLAUDE/AGENTS > plan > 規格 > task > 一般', () => {
    expect(prio('readme.MD')).toBe(0);
    expect(prio('Claude.md')).toBe(1);
    expect(prio('AGENTS.md')).toBe(1);
    expect(prio('PLAN.md')).toBe(2);
    expect(prio('docs/規格.md')).toBe(3);
    expect(prio('Tasks.md')).toBe(4);
    expect(prio('misc.md')).toBe(9);
  });
});

describe('looksBinary', () => {
  it('含 NUL 或非 UTF-8 視為二進位', () => {
    expect(looksBinary(new TextEncoder().encode('# 中文標題'))).toBe(false);
    expect(looksBinary(new Uint8Array([0x23, 0x00, 0x41]))).toBe(true);
    expect(looksBinary(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(true);
  });
});
