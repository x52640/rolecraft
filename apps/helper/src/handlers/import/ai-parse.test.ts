// import.ai_parse／import.ai_status（P1-T069）：假 provider（createFakeAdapter＋runWithSubscriptionCheck），
// 不呼叫真實 CLI。驗：背景整理＋輪詢、姓名與聯絡資料不進提示、未選模型不送、格式錯失敗、R6 紀錄照存。
// 履歷內容全為合成、去識別化。
import {
  BRIDGE_SCHEMAS,
  type BridgeOperation,
  type ImportAiParseView,
  type RunCheckRecord,
} from '@rolecraft/contracts';
import type { ExtractResult, TextLine } from '@rolecraft/resume-import';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { describe, expect, it } from 'vitest';

import { fakeEngine } from '../analysis/__fixtures__/analysis-env.ts';
import { HANDLERS } from '../registry.ts';
import type { HelperServices } from '../services.ts';
import { createResumeImportService } from './import-service.ts';

const line = (text: string, height = 10): TextLine => ({
  pageNumber: 1,
  column: 0,
  text,
  x: 40,
  y: 700,
  width: 100,
  height,
});

const LINES = [
  line('陳範例', 18), // 頁首大字：姓名（沒有「姓名：」標籤）
  line('手機：0933-444-555'),
  line('Email：demo@example.net'),
  line('工作經驗'),
  line('虛構雲端股份有限公司'),
  line('後端工程師 2020/05 ~ 至今'),
  line('負責付款 API。'),
];

const EXTRACTED: ExtractResult = {
  ok: true,
  pageCount: 1,
  pages: [{ pageNumber: 1, width: 595, height: 842, columns: 1, lines: LINES }],
  pagesWithoutText: [],
  draft: { name: null, dates: [], companies: [], titles: [], experiences: [], skills: [] },
};

const SECRETS = ['陳範例', '0933-444-555', 'demo@example.net'];

const f = (value: string, ...lines: string[]) => ({ value, lines });
const GOOD = JSON.stringify({
  education: [],
  experiences: [
    {
      company: f('虛構雲端股份有限公司', '1-5'),
      title: f('後端工程師', '1-6'),
      start: f('2020/05', '1-6'),
      end: f('至今', '1-6'),
      description: f('負責付款 API。', '1-7'),
    },
  ],
  skills: [],
  sections: [],
});

function setup(options: { text?: string; ai?: boolean; extracted?: ExtractResult } = {}) {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  const fake = fakeEngine(() => ({ text: options.text ?? GOOD }));
  const records: RunCheckRecord[] = [];
  let waiters: (() => void)[] = [];
  let n = 0;
  const service = createResumeImportService({
    picker: () => Promise.resolve({ fileName: 'resume.pdf', bytes: new Uint8Array() }),
    profiles: repos.profiles,
    extract: () => Promise.resolve(options.extracted ?? EXTRACTED),
    newId: () => `id-${String((n += 1))}`,
    ...(options.ai !== false && {
      ai: {
        engine: fake.engine,
        recordRunCheck: (record) => records.push(record),
        onSettled: () => {
          const pending = waiters;
          waiters = [];
          for (const resolve of pending) resolve();
        },
      },
    }),
  });
  const services: HelperServices = { resumeImport: service };
  async function call(op: BridgeOperation, payload: unknown): Promise<Record<string, unknown>> {
    const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
    const response = await handler(payload, services);
    expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    return response as Record<string, unknown>;
  }
  const settled = () => new Promise<void>((resolve) => waiters.push(resolve));
  return { fake, records, call, settled };
}

async function picked(env: ReturnType<typeof setup>): Promise<string> {
  const response = (await env.call('import.pick_pdf', {})) as {
    selection: { importId: string };
  };
  return response.selection.importId;
}

describe('import.ai_parse（P1-T069）', () => {
  it('背景整理：立即回執行中，輪詢拿到逐欄檢查過的草稿；姓名與聯絡資料只在本機、不進提示', async () => {
    const env = setup();
    const importId = await picked(env);
    expect(await env.call('import.ai_status', { importId })).toEqual({ ok: true, parse: null });
    const done = env.settled();
    expect(await env.call('import.ai_parse', { importId })).toEqual({
      ok: true,
      parse: { state: 'running', failure: null, draft: null },
    });
    await done;
    const status = (await env.call('import.ai_status', { importId })) as {
      parse: ImportAiParseView;
    };
    expect(status.parse.state).toBe('succeeded');
    const draft = status.parse.draft;
    expect(draft?.personalInfo.map((r) => [r.label, r.value.value])).toEqual([
      ['姓名', '陳範例'],
      ['手機', '0933-444-555'],
      ['Email', 'demo@example.net'],
    ]);
    expect(draft?.experiences[0]).toMatchObject({
      company: { value: '虛構雲端股份有限公司', pageNumber: 1, lineIndex: 4 },
      current: true,
      endDate: null,
    });
    expect(env.fake.prompts).toHaveLength(1);
    for (const secret of SECRETS) expect(env.fake.prompts[0]).not.toContain(secret);
    expect(env.records).toHaveLength(1);
  });

  it('同時要求兩次（StrictMode 重跑）：只送一次', async () => {
    const env = setup();
    const importId = await picked(env);
    const done = env.settled();
    await Promise.all([
      env.call('import.ai_parse', { importId }),
      env.call('import.ai_parse', { importId }),
    ]);
    await done;
    expect(env.fake.prompts).toHaveLength(1);
  });

  it('未選模型：回明確原因、不呼叫模型', async () => {
    const env = setup();
    env.fake.selectable = false;
    const importId = await picked(env);
    const response = await env.call('import.ai_parse', { importId });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(JSON.stringify(response)).toContain('選定模型');
    expect(env.fake.prompts).toHaveLength(0);
  });

  it('輸出格式不符：失敗、不採用、不自動重試', async () => {
    const env = setup({ text: '{"experiences": "不是陣列"}' });
    const importId = await picked(env);
    const done = env.settled();
    await env.call('import.ai_parse', { importId });
    await done;
    expect(await env.call('import.ai_status', { importId })).toEqual({
      ok: true,
      parse: { state: 'failed', failure: 'invalid_output', draft: null },
    });
    expect(env.fake.prompts).toHaveLength(1);
  });

  it('解析失敗的匯入、找不到的匯入：不呼叫模型', async () => {
    const env = setup({
      extracted: { ok: false, reason: 'no_text_layer', message: '沒有文字層' },
    });
    const importId = await picked(env);
    expect(await env.call('import.ai_parse', { importId })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(await env.call('import.ai_parse', { importId: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', message: '找不到這筆匯入，請重新選擇 PDF' },
    });
    expect(await env.call('import.ai_status', { importId: 'nope' })).toMatchObject({ ok: false });
    expect(env.fake.prompts).toHaveLength(0);
  });

  it('頁首「中文名 英文名 標語」：英文名也不進提示（對抗驗證）', async () => {
    const lines = [
      line('陳範例 Alex Chen 熱愛解決問題', 18),
      line('工作經驗'),
      line('Alex Chen 帶領虛構雲端的付款團隊。'),
    ];
    const env = setup({
      extracted: { ...EXTRACTED, pages: [{ ...EXTRACTED.pages[0], lines }] } as ExtractResult,
    });
    const importId = await picked(env);
    const done = env.settled();
    await env.call('import.ai_parse', { importId });
    await done;
    expect(env.fake.prompts[0]).not.toContain('Alex Chen');
    expect(env.fake.prompts[0]).not.toContain('陳範例');
    expect(env.fake.prompts[0]).toContain('帶領虛構雲端的付款團隊');
  });

  it('沒接上 AI：回尚未支援（編輯器改用規則預填）', async () => {
    const env = setup({ ai: false });
    const importId = await picked(env);
    expect(await env.call('import.ai_parse', { importId })).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
  });
});
