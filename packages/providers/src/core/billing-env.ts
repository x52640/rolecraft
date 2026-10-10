/**
 * 已知 API key 與雲端計費環境變數（R6-2、D2、D12）。這是**唯一**的清單，其他地方不得另抄。
 *
 * 比對一律不分大小寫（`-` 視同 `_`）：某些平台與函式庫會正規化名稱，寧可多擋。
 * 清單的來源附在各組上方；查閱日期 2026-10-10，實際 CLI 行為由 P1-T011 逐家實測。
 * 除了明列名稱，還有關鍵字與前綴兩層兜底，涵蓋未列出的同類變數。
 */

/**
 * Anthropic／Claude Code。
 * 來源：Claude Code 文件「Settings → Environment variables」與「Third-party integrations」
 * （https://code.claude.com/docs/en/settings 、/docs/en/amazon-bedrock 、/docs/en/google-vertex-ai 、
 * /docs/en/microsoft-foundry）。`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` 會把請求導到
 * API 計費或其他端點；`CLAUDE_CODE_USE_*` 會改走雲端供應商計費。
 */
const ANTHROPIC = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_VERTEX_BASE_URL',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_RESOURCE',
  'ANTHROPIC_FOUNDRY_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
  'CLOUD_ML_REGION',
] as const;

/**
 * OpenAI／Codex。
 * 來源：openai/codex 儲存庫 `docs/authentication.md`、`docs/exec.md`（`CODEX_API_KEY`、
 * `OPENAI_API_KEY` 會讓 codex 改用 API key 計費）、`docs/config.md`（model_providers 的
 * base_url／env_key）；OpenAI SDK README（`OPENAI_BASE_URL`、`OPENAI_ORG_ID`、`OPENAI_PROJECT_ID`）；
 * Azure OpenAI 文件（`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_ENDPOINT`）。
 */
const OPENAI = [
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_ORG_ID',
  'OPENAI_ORGANIZATION',
  'OPENAI_PROJECT_ID',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_BASE_URL',
] as const;

/**
 * Google（Gemini API／Vertex AI）。Antigravity CLI 專屬變數尚未查證（P1-T011）。
 * 來源：google-gemini/gemini-cli `docs/get-started/authentication.md`（`GEMINI_API_KEY`、
 * `GOOGLE_API_KEY`、`GOOGLE_GENAI_USE_VERTEXAI`、`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`）；
 * Google Cloud「Application Default Credentials」文件（`GOOGLE_APPLICATION_CREDENTIALS`）；
 * gcloud 文件（`CLOUDSDK_CORE_PROJECT`、`GCLOUD_PROJECT`）。
 */
const GOOGLE = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_API_KEY',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_CLOUD_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GCLOUD_PROJECT',
  'CLOUDSDK_CORE_PROJECT',
  'VERTEXAI_PROJECT',
  'VERTEXAI_LOCATION',
] as const;

/**
 * AWS（Bedrock）。
 * 來源：AWS CLI「Environment variables to configure the AWS CLI」文件；
 * Amazon Bedrock API keys 文件（`AWS_BEARER_TOKEN_BEDROCK`）。
 */
const AWS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_ROLE_ARN',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
] as const;

/**
 * Azure 與 Microsoft Foundry 通用憑證。
 * 來源：Azure Identity「EnvironmentCredential」文件。
 */
const AZURE = [
  'AZURE_API_KEY',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
] as const;

/** 明列名稱（大寫正規形）。 */
export const BILLING_ENV_NAMES: ReadonlySet<string> = new Set<string>([
  ...ANTHROPIC,
  ...OPENAI,
  ...GOOGLE,
  ...AWS,
  ...AZURE,
]);

/**
 * 兜底關鍵字：名稱含這些字就視為憑證／計費設定（例如 OPENROUTER_API_KEY、MISTRAL_APIKEY）。
 * 不含 `AUTH_TOKEN` 這種過寬的字，避免誤傷；明確的 token 變數由上方清單列出。
 */
export const BILLING_ENV_KEYWORDS: readonly string[] = [
  'API_KEY',
  'APIKEY',
  'ACCESS_KEY',
  'SECRET_ACCESS',
  'BEARER_TOKEN',
];

/** 兜底前綴：這些供應商／雲端的任何設定都不傳給子程序。 */
export const BILLING_ENV_PREFIXES: readonly string[] = [
  'ANTHROPIC_',
  'OPENAI_',
  'AZURE_OPENAI_',
  'CLAUDE_CODE_USE_',
  'AWS_',
  'GOOGLE_CLOUD_',
  'GOOGLE_GENAI_',
  'VERTEX',
  'BEDROCK',
];

/** 環境變數名正規化：大寫、`-` 換成 `_`。 */
export function normalizeEnvName(name: string): string {
  return name.toUpperCase().replaceAll('-', '_');
}

/** 是否為已知 API key 或雲端計費設定（不分大小寫）。 */
export function isBillingEnvName(name: string): boolean {
  const n = normalizeEnvName(name);
  if (BILLING_ENV_NAMES.has(n)) return true;
  if (BILLING_ENV_KEYWORDS.some((k) => n.includes(k))) return true;
  return BILLING_ENV_PREFIXES.some((p) => n.startsWith(p));
}
