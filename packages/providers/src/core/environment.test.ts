import { describe, expect, it } from 'vitest';

import { BILLING_ENV_NAMES, isBillingEnvName } from './billing-env.ts';
import { EnvironmentPolicyError, findBillingEnvNames, sanitizeEnvironment } from './environment.ts';

/** 各家代表性變數（測試另列一份，防止有人從集中清單刪掉）。 */
const MUST_BLOCK = [
  // Anthropic
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  // OpenAI／Codex
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'OPENAI_BASE_URL',
  'AZURE_OPENAI_API_KEY',
  // Google／Vertex
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUD_ML_REGION',
  // AWS／Bedrock
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_BEARER_TOKEN_BEDROCK',
  // Azure
  'AZURE_CLIENT_SECRET',
  // 兜底（關鍵字、前綴）
  'OPENROUTER_API_KEY',
  'MISTRAL_APIKEY',
  'GROQ_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_MODEL',
  'VERTEX_REGION',
  'BEDROCK_ENDPOINT',
];

const variants = (name: string) => [
  name,
  name.toLowerCase(),
  name.charAt(0).toLowerCase() + name.slice(1),
  name
    .split('')
    .map((c, i) => (i % 2 ? c.toLowerCase() : c))
    .join(''),
  name.replaceAll('_', '-'),
  name.toLowerCase().replaceAll('_', '-'),
];

describe('billing env list', () => {
  it.each(MUST_BLOCK)('%s 及其大小寫／連字號變體都被判為計費變數', (name) => {
    for (const v of variants(name)) expect(isBillingEnvName(v)).toBe(true);
  });

  it('集中清單每一項都會被擋（含變體）', () => {
    for (const name of BILLING_ENV_NAMES) {
      for (const v of variants(name)) expect(isBillingEnvName(v)).toBe(true);
    }
  });

  it.each(['PATH', 'HOME', 'LANG', 'TMPDIR', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'])(
    '%s 不是計費變數',
    (name) => {
      expect(isBillingEnvName(name)).toBe(false);
    },
  );
});

describe('sanitizeEnvironment', () => {
  const parent = {
    PATH: '/usr/bin',
    HOME: '/Users/me',
    LANG: 'zh_TW.UTF-8',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    anthropic_api_key: 'sk-ant-lower',
    Openai_Api_Key: 'sk-mixed',
    'codex-api-key': 'sk-hyphen',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
    GOOGLE_APPLICATION_CREDENTIALS: '/creds.json',
    RANDOM_OTHER: 'x',
    UNDEF: undefined,
  };

  it('移除所有計費變數（含大小寫變體），只回報名稱不含值', () => {
    const r = sanitizeEnvironment(parent);
    expect(findBillingEnvNames(r.env)).toEqual([]);
    expect(r.removedBillingNames).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'anthropic_api_key',
        'Openai_Api_Key',
        'codex-api-key',
        'AWS_SECRET_ACCESS_KEY',
        'GOOGLE_APPLICATION_CREDENTIALS',
      ].sort(),
    );
    const dump = JSON.stringify(r);
    for (const secret of ['sk-ant', 'sk-mixed', 'sk-hyphen', 'aws-secret', '/creds.json']) {
      expect(dump).not.toContain(secret);
    }
  });

  it('只帶出白名單變數，其餘不傳也不記名稱', () => {
    const r = sanitizeEnvironment(parent);
    expect(r.env).toEqual({ PATH: '/usr/bin', HOME: '/Users/me', LANG: 'zh_TW.UTF-8' });
    expect(r.droppedOtherCount).toBe(1);
    expect(JSON.stringify(r)).not.toContain('RANDOM_OTHER');
  });

  it('適配器可追加放行與固定設定非計費變數', () => {
    const r = sanitizeEnvironment(
      { ...parent, CODEX_HOME: '/Users/me/.codex' },
      { allow: ['CODEX_HOME'], set: { CLAUDE_CONFIG_DIR: '/tmp/iso' } },
    );
    expect(r.env['CODEX_HOME']).toBe('/Users/me/.codex');
    expect(r.env['CLAUDE_CONFIG_DIR']).toBe('/tmp/iso');
  });

  it.each([
    [{ allow: ['ANTHROPIC_API_KEY'] }],
    [{ allow: ['openai_api_key'] }],
    [{ set: { ANTHROPIC_BASE_URL: 'https://example.com' } }],
    [{ set: { 'claude-code-use-bedrock': '1' } }],
  ])('適配器政策放行或設定計費變數 %j 直接丟錯', (policy) => {
    expect(() => sanitizeEnvironment(parent, policy)).toThrow(EnvironmentPolicyError);
  });

  it('結果不可被修改', () => {
    const r = sanitizeEnvironment(parent);
    expect(Object.isFrozen(r.env)).toBe(true);
  });
});
