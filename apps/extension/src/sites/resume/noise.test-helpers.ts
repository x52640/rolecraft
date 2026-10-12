import { SubmitResumeCaptureRequest } from '@rolecraft/contracts';
import { expect } from 'vitest';

import { buildResumeCapture } from './capture.ts';
import { extractBlocks } from './extract.ts';
import { noiseElementMatcher } from './noise.ts';
import { simpleOracle } from './simple-oracle.ts';
import type { ResumeBlock, ResumeSiteConfig, UiNoiseRules } from './types.ts';

/** 合成 DOM、假資料；規則是測試自己登記的，不是任何網站的清單。 */
export const RULES: UiNoiseRules = {
  selectors: ['button', '.promo'],
  texts: ['編輯', '前往查看', '  看看  薪資 '],
  headingHints: ['排在第一筆的會當作最高學歷', '提示  字樣'],
};
export const BASE: ResumeSiteConfig = {
  platform: '104',
  rootSelector: '#resume',
  nameSelector: '.nm',
};
const deps = {
  doc: document,
  pageUrl: 'https://resume.example.com/view',
  oracle: simpleOracle,
  now: () => new Date('2026-10-13T00:00:00.000Z'),
};

export const p = (text: string, continues = false): ResumeBlock => ({
  kind: 'paragraph',
  level: null,
  label: null,
  text,
  continues,
});
export const h = (level: number, text: string, continues = false): ResumeBlock => ({
  kind: 'heading',
  level,
  label: null,
  text,
  continues,
});
export const lv = (label: string, text: string): ResumeBlock => ({
  kind: 'label_value',
  level: null,
  label,
  text,
  continues: false,
});

function strings(blocks: readonly ResumeBlock[]): string[] {
  return blocks.flatMap((b) => (b.label === null ? [b.text] : [b.text, b.label]));
}

/** a 的字元依序出現在 b 裡（可跳過）；兩邊都以 code point 為單位（擴充區漢字、emoji）。 */
export function isSubsequence(a: string, b: string): boolean {
  const want = Array.from(a);
  let at = 0;
  for (const ch of b) if (at < want.length && want[at] === ch) at += 1;
  return at === want.length;
}

/**
 * 通則（過濾只能讓輸出變少）：過濾後每段文字與標籤，都要是過濾前某段文字或標籤的子序列
 * （標題移除提示、標籤扣掉介面元素只會刪字；不得出現過濾前沒送出的內容）。
 */
export function expectNoiseSubset(
  before: readonly ResumeBlock[],
  after: readonly ResumeBlock[],
): void {
  const pool = strings(before);
  for (const text of strings(after)) {
    expect(
      pool.some((src) => isSubsequence(text, src)),
      `過濾後多出過濾前沒有的內容：${text}`,
    ).toBe(true);
  }
}

function capture(config: ResumeSiteConfig) {
  const request = buildResumeCapture(config, deps);
  if (typeof request === 'string') return request;
  return SubmitResumeCaptureRequest.parse(request).payload;
}

/** 設好頁面後擷取；有登記過濾時一併以同一 DOM 跑未過濾版本，斷言通則。 */
export function blocksOf(html: string, config: ResumeSiteConfig = { ...BASE, uiNoise: RULES }) {
  document.body.innerHTML = html;
  const result = capture(config);
  if (config.uiNoise) {
    const before = capture({ ...config, uiNoise: null });
    const afterBlocks = typeof result === 'string' ? [] : result.blocks;
    expectNoiseSubset(typeof before === 'string' ? [] : before.blocks, afterBlocks);
    if (typeof result !== 'string' && typeof before !== 'string') {
      expect(result.nameText).toBe(before.nameText);
    }
  }
  return result;
}

/** 直接抽取（根節點自訂）並斷言通則。 */
export function extractWithRules(root: Element, rules: UiNoiseRules = RULES): ResumeBlock[] {
  const after = extractBlocks(root, simpleOracle, noiseElementMatcher(rules));
  expectNoiseSubset(extractBlocks(root, simpleOracle), after);
  return after;
}
