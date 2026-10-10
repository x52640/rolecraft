import { describe, expect, it } from 'vitest';

import {
  assertExecutablePath,
  buildArgv,
  CommandPolicyError,
  type CommandSpec,
  defineCommand,
  findApiKeyModeFlags,
  MODEL_SLOT,
} from './command.ts';

describe('defineCommand／buildArgv', () => {
  const cmd = defineCommand(['-p', '--model', MODEL_SLOT, '--output-format', 'text']);

  it('只把模型 ID 填進佔位，其餘是常數', () => {
    expect(buildArgv(cmd, 'claude-opus-5-5[1m]')).toEqual([
      '-p',
      '--model',
      'claude-opus-5-5[1m]',
      '--output-format',
      'text',
    ]);
  });

  it.each([
    '--bare',
    '-x',
    'a b',
    'x;rm -rf ~',
    '$(id)',
    '`id`',
    'a|b',
    'a\nb',
    "a'b",
    'a"b',
    '',
    'x'.repeat(200),
  ])('不合法的模型 ID %j 被拒', (model) => {
    expect(() => buildArgv(cmd, model)).toThrow(CommandPolicyError);
  });

  it('有佔位卻沒給模型被拒', () => {
    expect(() => buildArgv(cmd, undefined)).toThrow(CommandPolicyError);
  });

  it('不是 defineCommand 產生的命令被拒（外部內容無法偽造命令）', () => {
    const forged: CommandSpec = { args: ['-p', 'anything from outside'] };
    expect(() => buildArgv(forged, undefined)).toThrow(CommandPolicyError);
  });

  it('命令凍結，事後無法塞入參數', () => {
    expect(Object.isFrozen(cmd)).toBe(true);
    expect(Object.isFrozen(cmd.args)).toBe(true);
    expect(() => (cmd.args as unknown as string[]).push('--bare')).toThrow();
  });

  it('型別層拒絕非字面值字串；執行時拒絕非字串', () => {
    const external: string = '外部內容';
    // @ts-expect-error 寬型別 string（外部內容）不能當參數
    defineCommand(['-p', external]);
    expect(() => defineCommand([42 as never])).toThrow(CommandPolicyError);
    expect(() => defineCommand(['a\0b'])).toThrow(CommandPolicyError);
  });
});

describe('API key 執行模式旗標', () => {
  it('claude 的 --bare（含 --bare=值）被找出', () => {
    expect(findApiKeyModeFlags('claude', defineCommand(['-p', '--bare']))).toEqual(['--bare']);
    expect(findApiKeyModeFlags('claude', defineCommand(['--bare=1']))).toEqual(['--bare=1']);
    expect(findApiKeyModeFlags('claude', defineCommand(['-p', '--barely']))).toEqual([]);
  });
});

describe('assertExecutablePath', () => {
  it.each(['claude', './claude', 'bin/claude', '/usr/bin/cl\naude', ''])('%j 被拒', (p) => {
    expect(() => assertExecutablePath(p)).toThrow(CommandPolicyError);
  });

  it('絕對路徑通過', () => {
    expect(() => assertExecutablePath('/opt/homebrew/bin/claude')).not.toThrow();
  });
});
