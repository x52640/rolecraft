/// <reference types="node" />
// 104 履歷編輯頁 fixture（P1-T017 去識別化、全是虛構資料）在真實 Chrome 的擷取結果，只在 RUN_CHROME=1 時跑。
// 和正式腳本同一套：registry 的根節點／姓名元素、`createChromeOracle(chrome)`，跑在擴充功能隔離環境。
// 預期區塊檔 expected-blocks.json 是這份 fixture 在 Chrome 跑出、經人工核對結構後存下的（ADR-0004 第 5 節）。
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ResumeCaptureBlock, SubmitResumeCaptureRequest } from '@rolecraft/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROME_TIMEOUT,
  type ChromeProbe,
  launchChromeProbe,
  RUN_CHROME,
} from './chrome.test-helpers.ts';
import { resumeConfig104 } from './config.ts';
import type { UiNoiseRules } from '../../resume/types.ts';
import { UI_NOISE_104 } from './ui-noise.ts';

const FIXTURE = readFileSync(
  path.join(import.meta.dirname, '../fixtures/resume-edit.html'),
  'utf8',
);
const EXPECTED = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'expected-blocks.json'), 'utf8'),
) as { truncated: boolean; nameText: string; blocks: ResumeCaptureBlock[] };

/** 「更多」收合區（display:none）裡的個人資料細項：fixture 裡有，但不能被讀到。 */
const COLLAPSED = [
  '34歲',
  '免役',
  '就業狀態',
  '待業中',
  '主要手機',
  '0900-000-000',
  'ivy.lin@example.com',
  '通訊地址',
  '範例路',
  '英文姓名',
  '聯絡方式',
  '10:00~17:00',
  '駕駛執照',
  '輕型機車駕照',
];

/** ADR-0004 5.2：根節點底下的區塊標題（h2），info 頁首卡沒有標題。 */
const SECTION_HEADINGS = [
  '學歷',
  '工作經驗',
  '求職條件',
  '語文能力',
  '專長',
  '自傳',
  '專案成就',
  '門市動線改善紀錄',
];

/** ADR-0004 5.3 的介面字樣（D29）：過濾後一個都不能出現（按鈕會接成一個區塊，所以也比對組合）。 */
const UI_WORDS = ['編輯', '版型', '背景', '更多', '新增', '刪除'];
const UI_JOINED = /^(?:編輯|版型|背景|更多|新增|刪除)+$/u;

function sameBlock(a: ResumeCaptureBlock | undefined, b: ResumeCaptureBlock): boolean {
  return a?.kind === b.kind && a.level === b.level && a.label === b.label && a.text === b.text;
}

/** 依 h2 分段統計：清單項、h3（專案標題）、各段區塊數。 */
function sections(blocks: readonly ResumeCaptureBlock[]) {
  const out: { title: string; blocks: ResumeCaptureBlock[] }[] = [{ title: 'info', blocks: [] }];
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 2) out.push({ title: block.text, blocks: [] });
    else out.at(-1)?.blocks.push(block);
  }
  return out;
}

describe.runIf(RUN_CHROME)('104 履歷編輯頁 fixture（真實 Chrome，RUN_CHROME=1）', () => {
  let probe: ChromeProbe;
  let blocks: ResumeCaptureBlock[];
  let payload: { truncated: boolean; nameText: string | null; url: string };
  /** 不套介面字樣過濾的對照組（過濾前） */
  let raw: { nameText: string | null; blocks: ResumeCaptureBlock[] };

  beforeAll(async () => {
    probe = await launchChromeProbe();
    probe.serve('/profile/edit', FIXTURE);
    const config = resumeConfig104();
    expect(config.uiNoise).toBe(UI_NOISE_104);
    type Payload = SubmitResumeCaptureRequest['payload'];
    const run = async (uiNoise: UiNoiseRules | null): Promise<Payload> => {
      const result = await probe.capture('/profile/edit', {
        rootSelector: config.rootSelector,
        nameSelector: config.nameSelector ?? null,
        uiNoise,
        pageUrl: 'https://pda.104.com.tw/profile/edit?vno=fake#top',
      });
      if (typeof result !== 'object' || !('op' in result)) throw new Error(JSON.stringify(result));
      return result.payload;
    };
    const filtered = await run(UI_NOISE_104);
    payload = filtered;
    blocks = filtered.blocks;
    raw = await run(null);
  }, CHROME_TIMEOUT);

  afterAll(async () => {
    await probe?.close();
  });

  it('抽出的區塊與預期逐項相符（含截斷、continues、姓名元素文字）', () => {
    expect(payload.url).toBe('https://pda.104.com.tw/profile/edit');
    expect(payload.truncated).toBe(EXPECTED.truncated);
    expect(payload.nameText).toBe(EXPECTED.nameText);
    expect(blocks).toEqual(EXPECTED.blocks);
  });

  it('「更多」收合區（含聯絡資料、英文姓名）過濾前後都不送；fixture 裡確實有這些字', () => {
    for (const list of [blocks, raw.blocks]) {
      const sent = list.flatMap((b) => [b.text, b.label ?? '']).join('\n');
      for (const value of COLLAPSED) {
        expect(FIXTURE).toContain(value);
        expect(sent).not.toContain(value);
      }
      expect(sent).not.toMatch(/[\w.]+@[\w.]+/u);
    }
    expect(raw.nameText).toBe(payload.nameText);
  });

  it('介面字樣過濾（D29）：預期不含 ADR 列的字樣；其餘區塊與過濾前依序相同', () => {
    expect(raw.blocks).toHaveLength(214);
    const texts = blocks.map((b) => b.text);
    for (const text of texts) expect(UI_JOINED.test(text)).toBe(false);
    for (const noise of UI_NOISE_104.texts) expect(texts).not.toContain(noise);
    const sent = texts.join('\n');
    for (const hint of UI_NOISE_104.headingHints) expect(sent).not.toContain(hint);
    // 過濾前確實有這些字樣（不是 fixture 沒有才通過）
    const rawTexts = raw.blocks.map((b) => b.text);
    expect(rawTexts.some((t) => UI_JOINED.test(t))).toBe(true);
    for (const word of UI_WORDS) expect(rawTexts.join('')).toContain(word);
    // 非標題區塊只少不多、順序不變（不會讀到過濾前沒有的內容）
    const kept = blocks.filter((b) => b.kind !== 'heading');
    let at = 0;
    for (const block of kept) {
      while (at < raw.blocks.length && !sameBlock(raw.blocks[at], block)) at += 1;
      expect(at).toBeLessThan(raw.blocks.length);
      at += 1;
    }
    expect(blocks.length).toBeLessThan(raw.blocks.length);
  });

  it('姓名元素是頁首卡的中文姓名；英文姓名元素（收合）不讀', () => {
    expect(payload.nameText).toBe('林雨晴');
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      level: null,
      label: null,
      text: '林雨晴',
      continues: false,
    });
  });

  it('區塊結構與 ADR-0004 5.2 一致', () => {
    const parts = sections(blocks);
    expect(parts.map((p) => p.title)).toEqual(['info', ...SECTION_HEADINGS]);
    const count = (title: string, pick: (b: ResumeCaptureBlock) => boolean) =>
      parts.find((p) => p.title.startsWith(title))?.blocks.filter(pick).length;
    const li = (b: ResumeCaptureBlock) => b.kind === 'list_item';
    expect(count('工作經驗', li)).toBe(28);
    expect(count('專長', li)).toBe(11);
    // 專案成就 4 筆，標題是 h3；其他區塊沒有 h3
    expect(blocks.filter((b) => b.kind === 'heading' && b.level === 3)).toHaveLength(4);
    expect(count('專案成就', (b) => b.kind === 'heading')).toBe(4);
    // 經歷 5 筆：每筆底下的薪資推廣連結已濾掉
    expect(count('工作經驗', (b) => /薪資競爭力$/u.test(b.text))).toBe(0);
    // 自傳 2 段（中文、英文），第 1 段雖有「更多」（CSS 截高），全文都讀到
    expect(blocks.some((b) => b.text.startsWith('下一步想往多店營運的方向走'))).toBe(true);
    expect(blocks.some((b) => b.text.startsWith('Next, I want to look after'))).toBe(true);
    // 桌面／手機重複的內容只出現一份（fixture 的 d-* 樣式）
    expect(blocks.filter((b) => b.text === '2021/3~2024/4')).toHaveLength(1);
    // 編輯頁本文沒有表單控制項：沒有標籤＋值區塊
    expect(blocks.filter((b) => b.kind === 'label_value')).toEqual([]);
  });
});
