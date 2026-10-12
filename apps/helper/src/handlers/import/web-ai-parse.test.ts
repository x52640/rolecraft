// 網頁來源的 AI 整理接線（P1-T080；resume-import「網頁來源的 AI 整理」）。假 provider，不呼叫真實 CLI；
// 驗：四個姓名來源各自不進提示、只有舊 Profile 姓名時不送（模型 0 次）、確認姓名後才送、姓名欄位過多不送、
// 擷取送達與 latest_capture 不呼叫模型、沒有模型不送、R6 不通過不送、執行中不重送、網址不進提示、網頁草稿形狀。
// 資料全為合成、去識別化。
import type { ImportAiParseView, ProfileInput } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { SECRET_URL, capture, h, lv, p, refused, webEnv } from './__fixtures__/web-env.ts';

const WORK = [
  h(2, '工作經驗'), // 標題之後的區塊依序是 b(n+1)…
  p('虛構雲端股份有限公司'),
  p('後端工程師'),
  p('負責付款 API。'),
];

const OUTPUT = (offset: number) =>
  JSON.stringify({
    education: [],
    experiences: [
      {
        company: { value: '虛構雲端股份有限公司', lines: [`b${String(offset + 2)}`] },
        title: { value: '後端工程師', lines: [`b${String(offset + 3)}`] },
        start: null,
        end: null,
        description: { value: '負責付款 API。', lines: [`b${String(offset + 4)}`] },
      },
    ],
    skills: [],
    sections: [],
  });

const PROFILE: ProfileInput = {
  personalInfo: { 姓名: '舊資料名', 英文姓名: 'Oldy Name', 手機: '0911-000-111', 居住地: '虛構市' },
  experiences: [],
  skills: [],
};

const notIn = (prompt: string | undefined, secrets: readonly string[]) => {
  expect(prompt).toBeDefined();
  for (const secret of secrets) expect(prompt).not.toContain(secret);
};

describe('import.ai_parse 網頁來源：姓名四來源（P1-T080）', () => {
  it('(1) 姓名元素文字：cleanHeaderName 切出的中文名與 headerNameAlias 的英文名都不進提示；網址不進提示', async () => {
    const blocks = [
      h(1, '林測試 Alex Lin'),
      p('熱愛解決問題'),
      ...WORK,
      p('我是 Alex Lin，林測試在此。'),
    ];
    const env = webEnv({ respond: () => OUTPUT(2) });
    const importId = await env.submit(capture(blocks, '林測試 Alex Lin 熱愛解決問題'));
    const parse = await env.parse(importId);
    expect(env.state.executed).toHaveLength(1);
    notIn(env.state.executed[0], ['林測試', 'Alex Lin', SECRET_URL, 'secret-vno']);
    expect(env.state.executed[0]).toContain('負責付款 API。');
    expect(parse).toMatchObject({ state: 'succeeded', source: 'web', draft: null });
    expect(parse.webDraft?.experiences[0]?.company?.blockId).toBe('b4');
    // 姓名元素文字預填姓名（出處是第一個含姓名的區塊）
    expect(parse.webDraft?.personalInfo[0]).toMatchObject({
      label: '姓名',
      value: { value: '林測試' },
    });
  });

  it('(2) 標籤為姓名的區塊值：沒有姓名元素也算辨識，姓名與聯絡值不進提示', async () => {
    const blocks = [lv('姓名', '范例安'), lv('手機', '0922-333-444'), ...WORK, p('范例安負責')];
    const env = webEnv({ respond: () => OUTPUT(2) });
    const importId = await env.submit(capture(blocks, null));
    expect((await env.parse(importId)).state).toBe('succeeded');
    notIn(env.state.executed[0], ['范例安', '0922-333-444']);
  });

  it('(3) 只有舊 Profile 的姓名：回 name_required、模型 0 次；(4) 帶確認姓名後才送，四者都不進提示', async () => {
    const blocks = [p('舊資料名 Oldy Name'), ...WORK, p('新名字甲的作品；聯絡 0911-000-111')];
    const env = webEnv({ respond: () => OUTPUT(1), profiles: [PROFILE] });
    const importId = await env.submit(capture(blocks, null));
    const error = await refused(env, importId);
    expect(error).toMatchObject({ code: 'invalid_request', reason: 'name_required' });
    expect(env.state.executed).toHaveLength(0);
    expect(await env.call('import.ai_status', { importId })).toEqual({ ok: true, parse: null });

    await env.parse(importId, ['新名字甲', 'New Name']);
    expect(env.state.executed).toHaveLength(1);
    notIn(env.state.executed[0], ['舊資料名', 'Oldy Name', '新名字甲', '0911-000-111']);
    expect(env.state.executed[0]).toContain('虛構雲端股份有限公司');
  });

  it('(4) 確認姓名可多個寫法；單字姓名不算確認（仍回 name_required）', async () => {
    const blocks = [...WORK, p('王範例 Wang Fan 撰寫')];
    const env = webEnv({ respond: () => OUTPUT(0) });
    const importId = await env.submit(capture(blocks, null));
    expect(await refused(env, importId, ['王'])).toMatchObject({ reason: 'name_required' });
    await env.parse(importId, ['王範例', 'Wang Fan']);
    notIn(env.state.executed[0], ['王範例', 'Wang Fan']);
  });

  it('姓／名欄位組合過多：invalid_request、沒有 reason、固定訊息；確認姓名也不送', async () => {
    const blocks = [
      ...['林', '王', '李', '陳', '張'].map((v) => lv('姓', v)),
      ...['晴', '明', '華', '芳'].map((v) => lv('名', v)),
      lv('姓名', '王小明'),
      ...WORK,
    ];
    const env = webEnv({ respond: () => OUTPUT(10) });
    const importId = await env.submit(capture(blocks, '王小明'));
    for (const names of [undefined, ['王小明']]) {
      const error = await refused(env, importId, names);
      expect(error).toEqual({ code: 'invalid_request', message: '姓名欄位過多，請改用手動輸入' });
    }
    expect(env.state.executed).toHaveLength(0);
  });
});

describe('import.ai_parse 網頁來源：何時呼叫模型（P1-T080）', () => {
  it('擷取送達、latest_capture、import.get、ai_status 都不呼叫模型', async () => {
    const env = webEnv({ respond: () => OUTPUT(1) });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    await env.call('import.latest_capture', {});
    await env.call('import.get', { importId });
    await env.call('import.ai_status', { importId });
    expect(env.state.executed).toHaveLength(0);
    expect(env.state.records).toHaveLength(0);
  });

  it('沒有選定且可用的模型：回原因、不呼叫', async () => {
    const env = webEnv();
    env.state.selectable = false;
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    const error = await refused(env, importId);
    expect(error.code).toBe('invalid_request');
    expect(error.reason).toBeUndefined();
    expect(env.state.executed).toHaveLength(0);
  });

  it('R6 不通過：不送模型、失敗 run_check_failed、R6 紀錄照存', async () => {
    const failed = { outcome: 'failed', basis: 'fake：改走 API key' } as const;
    const env = webEnv({ respond: () => OUTPUT(1), fake: { route: { cliConfig: failed } } });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    const parse = await env.parse(importId);
    expect(parse).toEqual<ImportAiParseView>({
      state: 'failed',
      failure: 'run_check_failed',
      draft: null,
      source: 'web',
      webDraft: null,
    });
    expect(env.state.executed).toHaveLength(0);
    expect(env.state.records).toHaveLength(1);
  });

  it('同一筆執行中再按（含同時兩次）：回同一個執行中狀態，只送一次', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const env = webEnv({ respond: () => OUTPUT(1), hold });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    const [a, b] = await Promise.all([
      env.call('import.ai_parse', { importId }),
      env.call('import.ai_parse', { importId }),
    ]);
    expect(a).toMatchObject({ ok: true, parse: { state: 'running', source: 'web' } });
    expect(b).toEqual(a);
    // 背景還在跑時再按：回同一個執行中狀態
    expect(await env.call('import.ai_parse', { importId })).toEqual(a);
    const done = env.settled();
    release();
    await done;
    expect(env.state.executed).toHaveLength(1);
    expect(await env.call('import.ai_status', { importId })).toMatchObject({
      parse: { state: 'succeeded' },
    });
  });

  it('模型輸出不合格式：失敗 invalid_output、沒有草稿', async () => {
    const env = webEnv({ respond: () => 'not json' });
    const importId = await env.submit(capture([h(1, '林測試'), ...WORK], '林測試'));
    expect(await env.parse(importId)).toMatchObject({ state: 'failed', failure: 'invalid_output' });
  });
});

it('網頁草稿：還原出姓名的欄位標示 containsPersonalData', async () => {
  const blocks = [h(1, '林測試'), h(2, '自傳'), p('林測試熱愛烘焙')];
  const output = JSON.stringify({
    education: [],
    experiences: [],
    skills: [],
    sections: [
      {
        heading: { value: '自傳', lines: ['b2'] },
        body: { value: '〔姓名〕熱愛烘焙', lines: ['b3'] },
      },
    ],
  });
  const env = webEnv({ respond: () => output });
  const importId = await env.submit(capture(blocks, '林測試'));
  const parse = await env.parse(importId);
  const body = parse.webDraft?.otherSections[0]?.body;
  expect(body).toMatchObject({
    value: '林測試熱愛烘焙',
    blockId: 'b3',
    containsPersonalData: true,
  });
});
