import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('package.json scripts', () => {
  it.each(Object.entries(pkg.scripts))('%s 指向的腳本檔存在', (_name, command) => {
    const match = /^node (\S+)/u.exec(command);
    expect(match).not.toBeNull();
    expect(existsSync(path.join(pkgDir, match?.[1] ?? ''))).toBe(true);
  });
});
