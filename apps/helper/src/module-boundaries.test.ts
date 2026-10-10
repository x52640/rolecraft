// 故意違規的 lint fixture：證明 eslint.config.js 的 E1 模組規則真的會擋。
// helper 是相依圖頂端，所以整個 repo 的邊界自我測試放這裡。
import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');

const eslint = new ESLint({
  cwd: ROOT,
  // 虛擬檔案不在任何 tsconfig 裡，關掉型別資訊規則，只驗邊界規則。
  overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
});

async function ruleIdsFor(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const use = (spec: string): string =>
  `import { PACKAGE_NAME } from '${spec}';\nvoid PACKAGE_NAME;\n`;

describe('module boundaries (docs/specs/architecture.md)', () => {
  it('allows a listed dependency', async () => {
    expect(await ruleIdsFor('packages/domain/src/x.ts', use('@rolecraft/contracts'))).toEqual([]);
    expect(await ruleIdsFor('apps/helper/src/x.ts', use('@rolecraft/pipeline'))).toEqual([]);
  });

  it.each([
    ['packages/domain/src/x.ts', '@rolecraft/storage'],
    ['packages/contracts/src/x.ts', '@rolecraft/domain'],
    ['packages/pipeline/src/x.ts', '@rolecraft/helper'],
    ['apps/editor/src/x.ts', '@rolecraft/domain'],
    ['apps/extension/src/x.ts', '@rolecraft/helper'],
  ])('blocks %s importing %s', async (file, spec) => {
    expect(await ruleIdsFor(file, use(spec))).toContain('no-restricted-imports');
  });

  it('blocks deep imports into another package', async () => {
    const ids = await ruleIdsFor('packages/domain/src/x.ts', use('@rolecraft/contracts/src/index'));
    expect(ids).toContain('no-restricted-imports');
  });

  it('blocks relative imports that escape the package', async () => {
    const ids = await ruleIdsFor('packages/domain/src/x.ts', use('../../contracts/src/index.ts'));
    expect(ids).toContain('rolecraft/no-relative-cross-package');
    expect(await ruleIdsFor('packages/domain/src/a/x.ts', use('../index.ts'))).toEqual([]);
  });

  it('keeps zod inside contracts', async () => {
    const code = "import { z } from 'zod';\nvoid z;\n";
    expect(await ruleIdsFor('packages/domain/src/x.ts', code)).toContain('no-restricted-imports');
    expect(await ruleIdsFor('packages/contracts/src/x.ts', code)).toEqual([]);
  });
});

describe('max-lines 300 for non-test source', () => {
  const lines = (n: number): string => 'export {};\n' + '// filler\n'.repeat(n - 1);

  it('accepts exactly 300 lines', async () => {
    expect(await ruleIdsFor('packages/domain/src/x.ts', lines(300))).toEqual([]);
  });

  it('rejects 301 lines', async () => {
    expect(await ruleIdsFor('packages/domain/src/x.ts', lines(301))).toContain('max-lines');
  });

  it('does not limit test files', async () => {
    expect(await ruleIdsFor('packages/domain/src/x.test.ts', lines(400))).toEqual([]);
  });
});

describe('dynamic import() boundaries (codex review P0-T001)', () => {
  const dyn = (spec: string): string => `export const m = import(${spec});\n`;
  const RULE = 'rolecraft/dynamic-import-boundary';

  it('allows a listed dependency', async () => {
    expect(await ruleIdsFor('packages/domain/src/x.ts', dyn("'@rolecraft/contracts'"))).toEqual([]);
  });

  it.each([
    ['packages/domain/src/x.ts', "'@rolecraft/storage'"],
    ['packages/domain/src/x.ts', '`@rolecraft/storage`'],
    ['packages/domain/src/x.ts', "'@rolecraft/contracts/src/index.ts'"],
    ['packages/domain/src/x.ts', "'zod'"],
    ['apps/editor/src/x.ts', "'@rolecraft/helper'"],
  ])('blocks %s importing %s', async (file, spec) => {
    expect(await ruleIdsFor(file, dyn(spec))).toContain(RULE);
  });

  it('blocks non-literal specifiers', async () => {
    const code = "const n = 'storage';\nexport const m = import(`@rolecraft/${n}`);\n";
    expect(await ruleIdsFor('packages/domain/src/x.ts', code)).toContain(RULE);
  });
});
