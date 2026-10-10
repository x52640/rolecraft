// 故意違規的 lint fixture：證明 eslint.config.js 的 defineCommand 規則真的會擋（P1-T010 對抗驗證）。
import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../../..');

const eslint = new ESLint({
  cwd: ROOT,
  // 虛擬檔案不在任何 tsconfig 裡，關掉型別資訊規則，只驗語法規則。
  overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
});

async function ruleIdsFor(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const PROVIDERS_FILE = 'packages/providers/src/core/x.ts';
const wrap = (body: string): string =>
  `import { defineCommand, MODEL_SLOT } from './command.ts';\n` +
  `declare const ext: string;\nvoid ext;\nvoid MODEL_SLOT;\n${body}\n`;

describe('defineCommand lint 規則', () => {
  it('字串常值、無插值樣板字串、MODEL_SLOT 通過', async () => {
    const code = wrap("export const c = defineCommand(['-p', `--x`, MODEL_SLOT]);");
    expect(await ruleIdsFor(PROVIDERS_FILE, code)).toEqual([]);
  });

  it.each([
    ['含插值的樣板字串', 'defineCommand([`--append-system-prompt=${ext}`])'],
    ['變數', 'defineCommand([ext])'],
    ['轉型', "defineCommand([ext as '-p'])"],
    ['展開', 'defineCommand([...[ext]])'],
    ['字串串接', "defineCommand(['--x=' + ext])"],
    ['條件運算式', "defineCommand([ext ? '-a' : '-b'])"],
    ['函式呼叫', 'defineCommand([String(ext)])'],
    ['非陣列常值', 'defineCommand([ext].map((s) => s))'],
  ])('%s 被擋', async (_name, call) => {
    const ids = await ruleIdsFor(PROVIDERS_FILE, wrap(`export const c = ${call};`));
    expect(ids).toContain('no-restricted-syntax');
  });

  it('規則只套用在 providers', async () => {
    const code = wrap('export const c = defineCommand([ext]);');
    expect(await ruleIdsFor('packages/domain/src/x.ts', code)).not.toContain(
      'no-restricted-syntax',
    );
  });
});
