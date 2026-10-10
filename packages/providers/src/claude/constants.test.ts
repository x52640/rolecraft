import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildArgv, defineCommand, MODEL_SLOT } from '../core/command.ts';
import { cliConfigItem, parseVersion, subscriptionLoginItem, versionItem } from './auth.ts';
import {
  assertClaudeCommands,
  CLAUDE_COMMANDS,
  CLAUDE_RUN_COMMAND,
  findForbiddenClaudeArgs,
} from './constants.ts';
import { findManagedSettings, locateClaude } from './locate.ts';

describe('命令列常數（ADR-0002 §1）', () => {
  it('與 ADR-0002 正式命令列完全相同，只有模型位置可變', () => {
    expect(buildArgv(CLAUDE_RUN_COMMAND, 'haiku')).toEqual([
      '-p',
      '--model',
      'haiku',
      '--output-format',
      'stream-json',
      '--verbose',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--safe-mode',
      '--disable-slash-commands',
      '--no-chrome',
      '--no-session-persistence',
      '--permission-mode',
      'dontAsk',
    ]);
    expect(CLAUDE_COMMANDS.flatMap(findForbiddenClaudeArgs)).toEqual([]);
  });

  it.each([
    [['--bare'], '--bare'],
    [['--settings', '{}'], '--settings'],
    [['--settings={}'], '--settings'],
    [['--tools', 'Read'], '--tools（值不是固定值）'],
    [['--tools'], '--tools（值不是固定值）'],
    [['--setting-sources', 'user'], '--setting-sources（值不是固定值）'],
    [['--permission-mode', 'bypassPermissions'], '--permission-mode（值不是固定值）'],
    [['--mcp-config', 'x.json'], '--mcp-config'],
    [['--plugin-dir', '/x'], '--plugin-dir'],
    [['--add-dir', '/'], '--add-dir'],
    [['--dangerously-skip-permissions'], '--dangerously-skip-permissions'],
    [['--debug-file', '/tmp/x'], '--debug-file'],
    [['--resume'], '--resume'],
  ] as const)('禁用 %j', (args, problem) => {
    // eslint-disable-next-line no-restricted-syntax -- 測試要組出各種禁用命令
    const spec = defineCommand([...args, MODEL_SLOT] as unknown as ['-x']);
    expect(findForbiddenClaudeArgs(spec)).toContain(problem);
    expect(() => assertClaudeCommands([spec])).toThrow('禁用旗標');
  });
});

describe('auth status／版本判定', () => {
  it('版本解析與比對', () => {
    const out = (stdout: string, exitCode = 0) => ({
      stdout,
      exitCode,
      stderr: '',
      aborted: false,
      truncated: false,
    });
    expect(parseVersion(out('2.1.296 (Claude Code)\n'))).toBe('2.1.296');
    expect(parseVersion(out('garbage'))).toBeNull();
    expect(parseVersion(out('2.1.296', 1))).toBeNull();
    expect(versionItem('2.1.296').outcome).toBe('passed');
    expect(versionItem(null).outcome).toBe('unknown');
  });

  it('其他供應商（Bedrock 等）或缺欄位', () => {
    const s = {
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'bedrock',
      apiKeySource: null,
      subscriptionType: null,
    };
    expect(subscriptionLoginItem(s).outcome).toBe('failed');
    expect(cliConfigItem(s, []).outcome).toBe('failed');
    expect(subscriptionLoginItem({ ...s, loggedIn: null }).outcome).toBe('unknown');
    expect(subscriptionLoginItem(null).outcome).toBe('unknown');
    const sub = { ...s, apiProvider: 'firstParty' };
    expect(subscriptionLoginItem(sub).basis).not.toMatch(/@|email/);
    expect(cliConfigItem(sub, ['/m']).outcome).toBe('unknown');
  });
});

describe('locateClaude／受管設定', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('只接受原生執行檔，解開符號連結；不接受 #! 腳本與不可執行檔', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rolecraft-locate-'));
    const script = join(dir, 'script-claude');
    writeFileSync(script, '#!/usr/bin/env node\n');
    chmodSync(script, 0o755);
    const noexec = join(dir, 'noexec');
    writeFileSync(noexec, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0]));
    const native = join(dir, '2.1.296');
    writeFileSync(native, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0]));
    chmodSync(native, 0o755);
    const link = join(dir, 'claude');
    symlinkSync(native, link);

    expect(await locateClaude([join(dir, 'missing'), script, noexec])).toBeNull();
    const found = await locateClaude([script, link]);
    expect(found?.endsWith('/2.1.296')).toBe(true);
  });

  it('受管設定：存在才回報', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rolecraft-managed-'));
    const file = join(dir, 'managed-settings.json');
    writeFileSync(file, '{}');
    expect(await findManagedSettings([file, join(dir, 'none.json')])).toEqual([file]);
  });
});
