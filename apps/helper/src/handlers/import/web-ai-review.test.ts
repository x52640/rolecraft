// P1-T080 審查（2026-10-12）：Profile 姓名與個資標籤（2、3）、無法拆出的英文頁首（5）、擠出後不呼叫模型（6）；
// 只有英文姓名標籤不算辨識（1）的 helper 端案例在 web-ai-parse-104.test.ts。假 provider，不呼叫真實 CLI；
// 資料全為合成、去識別化。
import type { ProfileInput } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { capture, h, p, refused, webEnv } from './__fixtures__/web-env.ts';

const WORK = [h(2, '工作經驗'), p('虛構雲端股份有限公司'), p('負責付款 API。')];
const profile = (personalInfo: Record<string, string>): ProfileInput => ({
  personalInfo,
  experiences: [],
  skills: [],
});

describe('2、3. 既有 Profile 的姓名與個資欄位', () => {
  it('英文名、中文名、暱稱、綽號、本名欄位的值都當姓名遮（含 2 字名字）', async () => {
    const info = {
      英文名: 'Oldy Lin',
      中文名: '舊晴',
      暱稱: '晴子',
      綽號: '小舊',
      本名: '舊本名',
    };
    const env = webEnv({ profiles: [profile(info)] });
    const text = '舊晴（晴子、小舊、舊本名、Oldy Lin）負責付款';
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK, p(text)], '林測試'));
    await env.parse(importId);
    const prompt = env.state.executed[0] ?? '';
    for (const value of Object.values(info)) expect(prompt).not.toContain(value);
    expect(prompt).toContain('負責付款');
  });

  it('長中文個資標籤（緊急聯絡人的通訊地址）的值也遮', async () => {
    const env = webEnv({ profiles: [profile({ 緊急聯絡人的通訊地址: '虛構市甲區乙路九號' })] });
    const blocks = [h(1, '林測試'), ...WORK, p('辦公室在虛構市甲區乙路九號旁')];
    const importId = await env.submit(capture(blocks, '林測試'));
    await env.parse(importId);
    expect(env.state.executed[0]).not.toContain('乙路九號');
  });
});

describe('5. 純英文的姓名元素文字', () => {
  it('拆不出姓名（Alex Smith Great Developer）：不算辨識，回 name_required、模型 0 次', async () => {
    const env = webEnv();
    const blocks = [h(1, 'Alex Smith Great Developer'), ...WORK];
    const importId = await env.submit(capture(blocks, 'Alex Smith Great Developer'));
    expect(await refused(env, importId)).toMatchObject({ reason: 'name_required' });
    expect(env.state.executed).toHaveLength(0);
    // 確認姓名後才送；整串頁首仍遮
    await env.parse(importId, ['Alex Smith']);
    expect(env.state.executed[0]).not.toContain('Alex Smith');
  });

  it('只有 1～3 個大寫開頭英文字（Alex Smith）：算辨識', async () => {
    const env = webEnv();
    const importId = await env.submit(capture([h(1, 'Alex Smith'), ...WORK], 'Alex Smith'));
    await env.parse(importId);
    expect(env.state.executed).toHaveLength(1);
    expect(env.state.executed[0]).not.toContain('Alex Smith');
  });

  it('中文名後接其他中文（林測試的履歷）不算可靠拆出：回 name_required', async () => {
    const env = webEnv();
    const importId = await env.submit(capture([h(1, '林測試的履歷'), ...WORK], '林測試的履歷'));
    expect(await refused(env, importId)).toMatchObject({ reason: 'name_required' });
  });
});

describe('6. 選模型期間匯入被擠掉', () => {
  it('select 之後匯入已不在：回 unknown_import、不呼叫模型', async () => {
    let release: () => void = () => undefined;
    const selectHold = new Promise<void>((resolve) => (release = resolve));
    const env = webEnv({ selectHold, maxImports: 1 });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    const pending = env.call('import.ai_parse', { importId });
    await env.submit(capture([h(1, '林測試'), ...WORK], '林測試')); // 擠掉第一筆
    release();
    const response = await pending;
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(env.state.executed).toHaveLength(0);
    expect(env.state.records).toHaveLength(0);
  });

  it('執行中被擠掉：中止該筆的 AbortController', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const env = webEnv({ hold, maxImports: 1 });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    expect(await env.call('import.ai_parse', { importId })).toMatchObject({ ok: true });
    await Promise.resolve();
    await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    expect(env.state.signals[0]?.aborted).toBe(true);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(env.state.executed).toHaveLength(0);
  });
});
