import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { isClaudeStreamGuarded } from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import { helperClaudeDeps } from './claude-deps.ts';

describe('helperClaudeDeps：Claude 執行 deps 一律經 claudeRunDeps', () => {
  it('沒給 spawn 也會得到守門版', () => {
    expect(isClaudeStreamGuarded(helperClaudeDeps({}).spawn)).toBe(true);
  });

  it('保留其他 deps 欄位；已包過的不重包', () => {
    const first = helperClaudeDeps({});
    const now = () => 1;
    const again = helperClaudeDeps({ ...first, now });
    expect(again.now).toBe(now);
    expect(again.spawn).toBe(first.spawn);
  });
});

const SRC = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/** 會實際執行 Claude CLI 的 providers API（需要 deps）。 */
const CLAUDE_RUNNERS =
  /\b(runWithSubscriptionCheck|checkConnection|createClaudeService|createClaudeAdapter|runClaudeReverification|verifyClaudeModel)\b/;
/** 自己組守門的 API：只有 claude-deps.ts 可以碰。 */
const RAW_GUARD = /\b(claudeRunDeps|createClaudeStreamGuard)\b/;

describe('靜態檢查：helper 其他檔案不自己組 Claude 執行 deps', () => {
  const files = sourceFiles(SRC).filter((f) => path.basename(f) !== 'claude-deps.ts');

  it('掃到正式原始碼', () => {
    expect(files.map((f) => path.basename(f))).toContain('main.ts');
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s', (_name, file) => {
    const code = readFileSync(file, 'utf8');
    expect(RAW_GUARD.test(code)).toBe(false);
    if (CLAUDE_RUNNERS.test(code)) expect(code).toContain('helperClaudeDeps');
  });
});
