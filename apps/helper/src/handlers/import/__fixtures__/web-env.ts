// 網頁來源 AI 整理的測試環境（P1-T080）：真實匯入服務＋記憶體資料區＋假 provider（createFakeAdapter＋
// runWithSubscriptionCheck，不呼叫真實 CLI）。executed 只記真正送到模型的提示（R6 通過後），用來計次。
// 資料全為合成、去識別化。
import {
  BRIDGE_SCHEMAS,
  type BridgeOperation,
  type ImportAiParseView,
  type ProfileInput,
  type RunCheckRecord,
} from '@rolecraft/contracts';
import {
  createFakeAdapter,
  runWithSubscriptionCheck,
  type FakeAdapterOptions,
} from '@rolecraft/providers';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { expect } from 'vitest';

import { HANDLERS } from '../../registry.ts';
import type { GenerationEngine } from '../../resume/generation.ts';
import type { HelperServices } from '../../services.ts';
import { createResumeImportService } from '../import-service.ts';
import type { ResumeCapturePayload } from '../service.ts';

export type Block = ResumeCapturePayload['blocks'][number];

export const h = (level: number, text: string): Block => ({
  kind: 'heading',
  level,
  label: null,
  text,
  continues: false,
});
export const p = (text: string, continues = false): Block => ({
  kind: 'paragraph',
  level: null,
  label: null,
  text,
  continues,
});
export const lv = (label: string, text: string): Block => ({
  kind: 'label_value',
  level: null,
  label,
  text,
  continues: false,
});

export const SECRET_URL = 'https://pda.104.com.tw/profile/edit?vno=secret-vno-123';

export function capture(blocks: Block[], nameText: string | null): ResumeCapturePayload {
  return {
    platform: '104',
    url: SECRET_URL,
    capturedAt: '2026-10-12T08:00:00.000Z',
    truncated: false,
    nameText,
    blocks,
  };
}

export interface WebEnvOptions {
  /** 模型回的文字（依提示決定） */
  respond?: (prompt: string) => string;
  fake?: FakeAdapterOptions;
  profiles?: ProfileInput[];
  /** 送到模型前先等這個（測「執行中」） */
  hold?: Promise<void>;
}

export function webEnv(options: WebEnvOptions = {}) {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  for (const [i, profile] of (options.profiles ?? []).entries()) {
    repos.profiles.save({ ...profile, id: `profile-${String(i)}`, pdfParseConfirmed: true });
  }
  const state = { selectable: true, executed: [] as string[], records: [] as RunCheckRecord[] };
  const respond = options.respond ?? (() => '{}');
  const engine: GenerationEngine = {
    select: () =>
      Promise.resolve(
        state.selectable
          ? {
              provider: 'claude',
              model: 'fake-model',
              budget: {
                contextLimit: 200_000,
                outputReserve: 0,
                toolOverheadReserve: 0,
                available: 200_000,
              },
              execute: async ({ prompt, signal }) => {
                await options.hold;
                const script = [{ text: respond(prompt) }];
                const adapter = createFakeAdapter({ ...options.fake, script });
                const outcome = await runWithSubscriptionCheck(
                  adapter,
                  { model: 'fake-model', prompt, trigger: 'run_start', signal },
                  { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'rc' },
                );
                state.executed.push(...adapter.calls.prompts);
                return outcome;
              },
            }
          : null,
      ),
  };
  let waiters: (() => void)[] = [];
  let n = 0;
  const service = createResumeImportService({
    profiles: repos.profiles,
    newId: () => `id-${String((n += 1))}`,
    ai: {
      engine,
      recordRunCheck: (record) => state.records.push(record),
      onSettled: () => {
        const pending = waiters;
        waiters = [];
        for (const resolve of pending) resolve();
      },
    },
  });
  const services: HelperServices = { resumeImport: service };
  async function call(op: BridgeOperation, payload: unknown): Promise<Record<string, unknown>> {
    const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
    const response = await handler(payload, services);
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    return response as Record<string, unknown>;
  }
  /** 送出擷取，回傳 importId（經 import.latest_capture，與編輯器相同） */
  async function submit(payload: ResumeCapturePayload): Promise<string> {
    expect(await call('submit_resume_capture', payload)).toEqual({ ok: true });
    const latest = (await call('import.latest_capture', {})) as { capture: { importId: string } };
    return latest.capture.importId;
  }
  /** 開始整理並等背景結束，回最後的狀態 */
  async function parse(importId: string, names?: string[]): Promise<ImportAiParseView> {
    const done = new Promise<void>((resolve) => waiters.push(resolve));
    const started = await call('import.ai_parse', { importId, ...(names && { names }) });
    expect(started).toMatchObject({ ok: true, parse: { state: 'running', source: 'web' } });
    await done;
    const status = (await call('import.ai_status', { importId })) as { parse: ImportAiParseView };
    return status.parse;
  }
  const settled = () => new Promise<void>((resolve) => waiters.push(resolve));
  return { state, call, submit, parse, settled, repos };
}

/** 呼叫 import.ai_parse 預期被拒（不開始）。 */
export async function refused(
  env: ReturnType<typeof webEnv>,
  importId: string,
  names?: string[],
): Promise<{ code: string; message: string; reason?: string }> {
  const response = await env.call('import.ai_parse', { importId, ...(names && { names }) });
  expect(response.ok).toBe(false);
  return (response as { error: { code: string; message: string; reason?: string } }).error;
}
