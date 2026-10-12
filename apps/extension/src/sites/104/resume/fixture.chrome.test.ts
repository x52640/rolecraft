/// <reference types="node" />
// 104 履歷編輯頁 fixture（P1-T017 去識別化、全是虛構資料）在真實 Chrome 的擷取結果，只在 RUN_CHROME=1 時跑。
// 和正式腳本同一套：registry 的根節點／姓名元素、`createChromeOracle(chrome)`，跑在擴充功能隔離環境。
// 預期區塊檔 expected-blocks.json 是這份 fixture 在 Chrome 跑出、經人工核對結構後存下的（ADR-0004 第 5 節）。
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ResumeCaptureBlock } from '@rolecraft/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROME_TIMEOUT,
  type ChromeProbe,
  launchChromeProbe,
  RUN_CHROME,
} from './chrome.test-helpers.ts';
import { resumeConfig104 } from './config.ts';

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
  '學歷 排列在第一筆的會被系統當作最高學歷哟～',
  '工作經驗 系統依日期自動排序，如果經歷有調整過，記得總年資也要更新呦~',
  '求職條件',
  '語文能力',
  '專長',
  '自傳',
  '專案成就',
  '門市動線改善紀錄',
];

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

  beforeAll(async () => {
    probe = await launchChromeProbe();
    probe.serve('/profile/edit', FIXTURE);
    const config = resumeConfig104();
    const result = await probe.capture('/profile/edit', {
      rootSelector: config.rootSelector,
      nameSelector: config.nameSelector ?? null,
      pageUrl: 'https://pda.104.com.tw/profile/edit?vno=fake#top',
    });
    if (typeof result !== 'object' || !('op' in result)) throw new Error(JSON.stringify(result));
    payload = result.payload;
    blocks = result.payload.blocks;
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

  it('「更多」收合區（含聯絡資料、英文姓名）不送；fixture 裡確實有這些字', () => {
    const sent = blocks.flatMap((b) => [b.text, b.label ?? '']).join('\n');
    for (const value of COLLAPSED) {
      expect(FIXTURE).toContain(value);
      expect(sent).not.toContain(value);
    }
    expect(sent).not.toMatch(/[\w.]+@[\w.]+/u);
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
    // 經歷 5 筆：每筆底下一個薪資推廣連結
    expect(count('工作經驗', (b) => /薪資競爭力$/u.test(b.text))).toBe(5);
    // 自傳 2 段（中文、英文），第 1 段雖有「更多」（CSS 截高），全文都讀到
    expect(blocks.some((b) => b.text.startsWith('下一步想往多店營運的方向走'))).toBe(true);
    expect(blocks.some((b) => b.text.startsWith('Next, I want to look after'))).toBe(true);
    // 桌面／手機重複的內容只出現一份（fixture 的 d-* 樣式）
    expect(blocks.filter((b) => b.text === '2021/3~2024/4')).toHaveLength(1);
    // 編輯頁本文沒有表單控制項：沒有標籤＋值區塊
    expect(blocks.filter((b) => b.kind === 'label_value')).toEqual([]);
  });
});
