// ESLint flat config：E1 模組規則（單檔 300 行、相依方向、禁止 deep import）。
// 相依表搬自 docs/specs/architecture.md「模組切分」；改表要先改 spec。
import path from 'node:path';

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ROOT = import.meta.dirname;
const MAX_LINES = 300;

/** 套件目錄 → 可以依賴的 @rolecraft 套件（不含 zod 等外部套件）。 */
const ALLOWED_DEPS = {
  'packages/contracts': [],
  'packages/domain': ['contracts'],
  'packages/storage': ['contracts', 'domain'],
  'packages/sources': ['contracts', 'domain'],
  'packages/resume-import': ['contracts'],
  'packages/providers': ['contracts', 'domain'],
  'packages/pipeline': ['contracts', 'domain', 'providers'],
  'packages/pdf-export': ['contracts'],
  'apps/helper': [
    'contracts',
    'domain',
    'storage',
    'sources',
    'resume-import',
    'providers',
    'pipeline',
    'pdf-export',
  ],
  'apps/extension': ['contracts'],
  'apps/editor': ['contracts'],
};

/** 只有這些套件可以 import zod。 */
const ZOD_OWNERS = new Set(['packages/contracts']);

const SOURCE_GLOB = 'src/**/*.{ts,tsx}';

function restrictedImportsFor(pkgDir) {
  const allowed = ALLOWED_DEPS[pkgDir];
  const patterns = [
    {
      group: ['@rolecraft/*', ...allowed.map((name) => `!@rolecraft/${name}`)],
      message: `${pkgDir} 只能依賴：${allowed.join('、') || '（無其他 @rolecraft 套件）'}（docs/specs/architecture.md）`,
    },
    {
      group: ['@rolecraft/*/**'],
      message: '跨套件只能從套件入口 import，不得 deep import。',
    },
  ];
  if (!ZOD_OWNERS.has(pkgDir)) {
    patterns.push({
      group: ['zod', 'zod/**'],
      message: 'zod 只用在 @rolecraft/contracts；其他套件改用 contracts 匯出的 schema。',
    });
  }
  return ['error', { patterns }];
}

/** 套件根目錄（相對 repo 根），例如 packages/domain；不在任何套件內回傳 null。 */
function packageRootOf(absFile) {
  const rel = path.relative(ROOT, absFile).split(path.sep);
  if (rel.length < 2 || (rel[0] !== 'packages' && rel[0] !== 'apps')) return null;
  return path.join(ROOT, rel[0], rel[1]);
}

/** 禁止用相對路徑跨出自己的套件（等於繞過入口的 deep import）。 */
const noRelativeCrossPackage = {
  meta: {
    type: 'problem',
    messages: {
      escape: '相對路徑 "{{source}}" 跨出套件 {{pkg}}；請改從對方套件入口 import。',
    },
    schema: [],
  },
  create(context) {
    const pkgRoot = packageRootOf(context.filename);
    if (!pkgRoot) return {};
    const check = (node) => {
      const source = node.source;
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
      if (!source.value.startsWith('.')) return;
      const target = path.resolve(path.dirname(context.filename), source.value);
      const rel = path.relative(pkgRoot, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        context.report({
          node: source,
          messageId: 'escape',
          data: { source: source.value, pkg: path.relative(ROOT, pkgRoot) },
        });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

/**
 * no-restricted-imports 不檢查 import()：動態 import 必須是字串常值，且套用同一份相依表（codex review P0-T001）。
 * 選項：{ allowed: 可依賴的套件名, zodAllowed: 是否可用 zod }。
 */
const dynamicImportBoundary = {
  meta: {
    type: 'problem',
    messages: {
      nonLiteral: '動態 import 的目標必須是字串常值，才能檢查模組邊界。',
      forbidden: '動態 import "{{source}}" 違反模組邊界：{{reason}}（docs/specs/architecture.md）',
    },
    schema: [{ type: 'object' }],
  },
  create(context) {
    const { allowed, zodAllowed } = context.options[0];
    return {
      ImportExpression(node) {
        const source = node.source;
        const value =
          source.type === 'Literal'
            ? source.value
            : source.type === 'TemplateLiteral' && source.expressions.length === 0
              ? source.quasis[0].value.cooked
              : null;
        if (typeof value !== 'string') {
          context.report({ node: source, messageId: 'nonLiteral' });
          return;
        }
        let reason = null;
        if (value.startsWith('@rolecraft/')) {
          const [, name, ...rest] = value.split('/');
          if (rest.length) reason = '跨套件只能從套件入口 import';
          else if (!allowed.includes(name)) reason = `只能依賴 ${allowed.join('、') || '（無）'}`;
        } else if (!zodAllowed && (value === 'zod' || value.startsWith('zod/'))) {
          reason = 'zod 只用在 @rolecraft/contracts';
        }
        if (reason)
          context.report({ node: source, messageId: 'forbidden', data: { source: value, reason } });
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.claude/**',
      'scripts/coordinator/*.workflow.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: ROOT,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/fixtures/**', '**/__fixtures__/**'],
    rules: { 'max-lines': ['error', { max: MAX_LINES }] },
  },
  {
    files: [`{packages,apps}/*/${SOURCE_GLOB}`],
    plugins: {
      rolecraft: {
        rules: {
          'no-relative-cross-package': noRelativeCrossPackage,
          'dynamic-import-boundary': dynamicImportBoundary,
        },
      },
    },
    rules: { 'rolecraft/no-relative-cross-package': 'error' },
  },
  {
    // P1-T010 對抗驗證：defineCommand 的參數只能是字串常值或 MODEL_SLOT（型別層之外的第二道防線）。
    files: [`packages/providers/${SOURCE_GLOB}`],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='defineCommand'] > ArrayExpression > TemplateLiteral[expressions.length>0]",
          message: 'defineCommand 參數不得是含插值的樣板字串；只能用字串常值或 MODEL_SLOT。',
        },
        {
          selector:
            "CallExpression[callee.name='defineCommand'] > ArrayExpression > :not(Literal, TemplateLiteral, Identifier[name='MODEL_SLOT'])",
          message:
            'defineCommand 參數只能是字串常值或 MODEL_SLOT（不得用變數、運算式、展開或轉型）。',
        },
        {
          selector:
            "CallExpression[callee.name='defineCommand'][arguments.0.type!='ArrayExpression']",
          message: 'defineCommand 必須直接傳入陣列常值。',
        },
      ],
    },
  },
  ...Object.keys(ALLOWED_DEPS).map((pkgDir) => ({
    files: [`${pkgDir}/${SOURCE_GLOB}`],
    rules: {
      'no-restricted-imports': restrictedImportsFor(pkgDir),
      'rolecraft/dynamic-import-boundary': [
        'error',
        { allowed: ALLOWED_DEPS[pkgDir], zodAllowed: ZOD_OWNERS.has(pkgDir) },
      ],
    },
  })),
);
