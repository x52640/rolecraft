// import.confirm 寫各欄出處（D30，P1-T090；resume-import「個人資料編輯（D30）」「出處」）。
// 驗：只在值相同（去空白、NFKC）時寫出處；出處文字從工作階段原文取、多個出處依序接合（含 pipeline 的 moreBlockIds／
// moreLines）；經歷以公司＋職稱＋開始對；「學歷」列比對學歷接合值；300 字截斷；請求帶出處／版本號被 schema 擋；
// 版本號加一。假 provider，不呼叫真實 CLI；資料全為合成、去識別化。
import {
  BRIDGE_SCHEMAS,
  type ImportAiParseView,
  type ImportResult,
  type ProfileInput,
} from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { capture, h, lv, p, webEnv } from './__fixtures__/web-env.ts';
import { sourceDraftOf } from './confirm-draft.ts';
import { confirmSources } from './confirm-sources.ts';

const field = (value: string, pageNumber: number, lineIndex: number) => ({
  value,
  pageNumber,
  lineIndex,
});

const PARSED: Extract<ImportResult, { status: 'parsed' }> = {
  status: 'parsed',
  displayName: 'r.pdf',
  pages: [
    {
      pageNumber: 1,
      lines: [
        '范例安',
        '虛構科技股份有限公司 資深工程師',
        '2019/03 ~ 至今',
        '負責付款系統',
        '維護 API 閘道',
        'TypeScript、Go',
        '國立虛構大學 資訊工程學系',
      ],
    },
  ],
  pagesWithoutText: [],
  draft: {
    name: field('范例安', 1, 0),
    dates: [],
    companies: [],
    titles: [],
    experiences: [],
    skills: [field('TypeScript', 1, 5)],
  },
};

const AI_VIEW: ImportAiParseView = {
  state: 'succeeded',
  failure: null,
  draft: {
    personalInfo: [{ label: '姓名', value: field('范例安', 1, 0) }],
    education: [field('國立虛構大學', 1, 6), field('資訊工程學系', 1, 6)],
    experiences: [
      {
        company: field('虛構科技股份有限公司', 1, 1),
        title: field('資深工程師', 1, 1),
        startDate: field('2019/03', 1, 2),
        endDate: null,
        current: true,
        description: {
          ...field('負責付款系統\n維護 API 閘道', 1, 3),
          moreLines: [{ pageNumber: 1, lineIndex: 4 }],
        },
      },
    ],
    skills: [field('TypeScript', 1, 5), field('Go', 1, 5)],
    otherSections: [],
    discarded: [],
  },
};

const CONFIRMED: ProfileInput = {
  personalInfo: { 姓名: '范例安', 學歷: '國立虛構大學\n資訊工程學系' },
  experiences: [
    {
      company: '虛構科技股份有限公司',
      title: '資深工程師',
      startDate: '2019/03',
      endDate: null,
      description: '負責付款系統\n維護 API 閘道',
    },
  ],
  skills: ['TypeScript', 'Rust'],
};

const src = (text: string, kind: 'pdf' | 'web' = 'pdf') => ({
  kind,
  text,
  truncated: false,
  modified: false,
});

describe('import.confirm 出處（D30）：比對規則', () => {
  it('PDF AI 草稿：值相同才寫出處；多行描述依序接合；「學歷」列比學歷接合值；改過的技能沒有出處', () => {
    const sources = confirmSources(sourceDraftOf(PARSED, AI_VIEW), CONFIRMED);
    expect(sources.personalInfo).toEqual({
      姓名: src('范例安'),
      學歷: src('國立虛構大學 資訊工程學系'),
    });
    expect(sources.experiences).toEqual([
      {
        company: src('虛構科技股份有限公司 資深工程師'),
        title: src('虛構科技股份有限公司 資深工程師'),
        startDate: src('2019/03 ~ 至今'),
        endDate: null,
        description: src('負責付款系統\n維護 API 閘道'),
      },
    ]);
    expect(sources.skills).toEqual([src('TypeScript、Go'), null]);
  });

  it('正規化比對：去空白、全半形統一（NFKC）仍算相同', () => {
    const confirmed = { ...CONFIRMED, skills: ['ＴｙｐｅＳｃｒｉｐｔ'] };
    const sources = confirmSources(sourceDraftOf(PARSED, AI_VIEW), confirmed);
    expect(sources.skills).toEqual([src('TypeScript、Go')]);
  });

  it('經歷以公司＋職稱＋開始對：開始日期改過就整段沒有出處；描述改過只有描述沒有', () => {
    const [experience] = CONFIRMED.experiences;
    if (!experience) throw new Error('fixture');
    const confirmed = {
      ...CONFIRMED,
      experiences: [
        { ...experience, startDate: '2019/04' },
        { ...experience, description: '自己改寫的描述' },
      ],
    };
    const [moved, edited] = confirmSources(sourceDraftOf(PARSED, AI_VIEW), confirmed).experiences;
    expect(moved).toEqual({
      company: null,
      title: null,
      startDate: null,
      endDate: null,
      description: null,
    });
    expect(edited?.company).toEqual(src('虛構科技股份有限公司 資深工程師'));
    expect(edited?.description).toBeNull();
  });

  it('沒有 AI 草稿：用本機預填（PDF 通用規則只有姓名與技能）；手動輸入全部沒有出處', () => {
    const local = confirmSources(sourceDraftOf(PARSED, null), CONFIRMED);
    expect(local.personalInfo).toEqual({ 姓名: src('范例安') });
    expect(local.experiences[0]?.company).toBeNull();
    expect(local.skills).toEqual([src('TypeScript、Go'), null]);
    const manual = confirmSources(
      sourceDraftOf({ status: 'manual', displayName: '手動輸入' }, null),
      CONFIRMED,
    );
    expect(manual.personalInfo).toEqual({});
    expect(manual.skills).toEqual([null, null]);
  });

  it('本機預填只記第一行的多行值：往後補到涵蓋整個值為止', () => {
    const result = {
      ...PARSED,
      draft: { ...PARSED.draft, skills: [field('Go 維護 API', 1, 4)] },
    };
    const sources = confirmSources(sourceDraftOf(result, null), {
      ...CONFIRMED,
      skills: ['Go 維護 API'],
    });
    // 「維護 API 閘道」不含整個值 → 補下一行仍不含 → 只記第一行
    expect(sources.skills).toEqual([src('維護 API 閘道')]);
    const spanning = {
      ...PARSED,
      draft: { ...PARSED.draft, skills: [field('負責付款系統維護', 1, 3)] },
    };
    const extended = confirmSources(sourceDraftOf(spanning, null), {
      ...CONFIRMED,
      skills: ['負責付款系統維護'],
    });
    expect(extended.skills).toEqual([src('負責付款系統\n維護 API 閘道')]);
  });

  it('出處原文超過 300 字截斷並標示', () => {
    const long = `${'長'.repeat(299)}😀尾巴`;
    const result = { ...PARSED, pages: [{ pageNumber: 1, lines: ['范例安', long] }] };
    const view: ImportAiParseView = {
      ...AI_VIEW,
      draft: { ...AI_VIEW.draft!, skills: [field('尾巴', 1, 1)], education: [] },
    };
    const sources = confirmSources(sourceDraftOf(result, view), { ...CONFIRMED, skills: ['尾巴'] });
    expect(sources.skills[0]).toEqual({
      kind: 'pdf',
      text: `${'長'.repeat(299)}😀`,
      truncated: true,
      modified: false,
    });
  });
});

describe('import.confirm 出處（D30）：網頁來源接線', () => {
  const BLOCKS = [
    lv('姓名', '范例安'),
    h(2, '工作經驗'),
    p('虛構雲端股份有限公司'),
    p('後端工程師'),
    p('負責付款 API。'),
    p('維運排程系統。'),
  ];
  const OUTPUT = JSON.stringify({
    education: [],
    experiences: [
      {
        company: { value: '虛構雲端股份有限公司', lines: ['b3'] },
        title: { value: '後端工程師', lines: ['b4'] },
        start: null,
        end: null,
        description: { value: '負責付款 API。\n維運排程系統。', lines: ['b5', 'b6'] },
      },
    ],
    skills: [],
    sections: [],
  });
  const confirmed = (description: string): ProfileInput => ({
    personalInfo: { 姓名: '范例安' },
    experiences: [
      {
        company: '虛構雲端股份有限公司',
        title: '後端工程師',
        startDate: '2020',
        endDate: null,
        description,
      },
    ],
    skills: [],
  });

  it('AI 草稿引用多個區塊：出處依序接合全部引用區塊；版本號加一', async () => {
    const env = webEnv({ respond: () => OUTPUT });
    const importId = await env.submit(capture(BLOCKS, null));
    const parse = await env.parse(importId);
    expect(parse.webDraft?.experiences[0]?.description).toMatchObject({
      blockId: 'b5',
      moreBlockIds: ['b6'],
    });
    // 經歷要以公司＋職稱＋開始對：AI 沒給開始日期 → 這段經歷對不到草稿，沒有出處
    await env.call('import.confirm', {
      importId,
      profile: confirmed('負責付款 API。\n維運排程系統。'),
    });
    const [saved] = env.repos.profiles.list();
    expect(saved?.version).toBe(1);
    expect(saved?.sources?.personalInfo).toEqual({ 姓名: src('范例安', 'web') });
    expect(saved?.sources?.experiences[0]?.description).toBeNull();
  });

  it('經歷對得到時：描述出處是 b5、b6 兩個區塊的原文；再次確認版本號再加一、出處整份重算', async () => {
    const output = JSON.stringify({
      ...(JSON.parse(OUTPUT) as object),
      experiences: [
        {
          company: { value: '虛構雲端股份有限公司', lines: ['b3'] },
          title: { value: '後端工程師', lines: ['b4'] },
          start: { value: '2020', lines: ['b7'] },
          end: null,
          description: { value: '負責付款 API。\n維運排程系統。', lines: ['b5', 'b6'] },
        },
      ],
    });
    const env = webEnv({ respond: () => output });
    const importId = await env.submit(capture([...BLOCKS, p('2020')], null));
    await env.parse(importId);
    await env.call('import.confirm', {
      importId,
      profile: confirmed('負責付款 API。\n維運排程系統。'),
    });
    const first = env.repos.profiles.list()[0];
    expect(first?.sources?.experiences[0]).toMatchObject({
      company: src('虛構雲端股份有限公司', 'web'),
      startDate: src('2020', 'web'),
      description: src('負責付款 API。\n維運排程系統。', 'web'),
    });
    await env.call('import.confirm', { importId, profile: confirmed('改寫') });
    const second = env.repos.profiles.list()[0];
    expect(second?.version).toBe(2);
    expect(second?.sources?.experiences[0]?.description).toBeNull();
  });

  it('請求帶出處或版本號：schema 擋下（呼叫端不能送出處文字）', () => {
    const request = BRIDGE_SCHEMAS['import.confirm'].request;
    const base = { op: 'import.confirm', payload: { importId: 'i-1', profile: confirmed('x') } };
    expect(request.safeParse(base).success).toBe(true);
    const sources = { personalInfo: { 姓名: src('偽造的出處') }, experiences: [], skills: [] };
    for (const extra of [{ sources }, { version: 9 }]) {
      const payload = { ...base.payload, profile: { ...base.payload.profile, ...extra } };
      expect(request.safeParse({ ...base, payload }).success).toBe(false);
      expect(
        BRIDGE_SCHEMAS['import.save_corrections'].request.safeParse({
          op: 'import.save_corrections',
          payload,
        }).success,
      ).toBe(false);
    }
  });
});
