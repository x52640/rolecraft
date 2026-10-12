// P1-T080 審查（2026-10-12）：送出條件只認非別名類姓名標籤（1）、姓名寫法變體與不分大小寫（4）。
// 資料全為合成、去識別化；不呼叫真實 CLI。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { h, inputsOf, lv, p, type BlockSpec } from './web-fixtures.test-helpers.ts';
import type { WebResumeParseInputs } from './types.ts';
import { prepareWebResumeParse } from './web-prepare.ts';

const prepare = (specs: readonly BlockSpec[], names: Partial<WebResumeParseInputs> = {}) =>
  prepareWebResumeParse(inputsOf(specs, names), budget(1_000_000), idSource());

function promptOf(specs: readonly BlockSpec[], names: Partial<WebResumeParseInputs> = {}): string {
  const result = prepare(specs, names);
  if (!result.ok) throw new Error(result.reason);
  return result.prepared.prompt;
}

describe('1. 只有英文姓名類標籤不算已辨識', () => {
  it('頁首沒有標籤的中文名＋「英文姓名：Ivy」：name_unconfirmed，不送', () => {
    const specs = [p('林雨晴'), lv('英文姓名', 'Ivy'), h(2, '自傳'), p('林雨晴喜歡門市營運')];
    expect(prepare(specs)).toEqual({ ok: false, reason: 'name_unconfirmed' });
  });

  it('「姓名（英文）」「Nickname」「綽號」也只算別名', () => {
    for (const label of ['姓名（英文）', 'Nickname', '綽號', 'Preferred Name']) {
      expect(prepare([lv(label, 'Ivy Lin'), p('門市營運')])).toEqual({
        ok: false,
        reason: 'name_unconfirmed',
      });
    }
  });

  it('同時有主要姓名標籤（姓名、Name、中文名）就算', () => {
    for (const label of ['姓名', 'Name', '中文名']) {
      const prompt = promptOf([lv(label, '林雨晴'), lv('英文姓名', 'Ivy'), p('林雨晴 Ivy 營運')]);
      expect(prompt).not.toContain('林雨晴');
      expect(prompt).not.toContain('Ivy');
    }
  });
});

describe('4. 姓名寫法變體', () => {
  const body = (text: string) => [h(2, '自傳'), p(text), p('喜歡門市營運')];

  it('確認「林 雨晴」遮得到「林雨晴」，確認「林雨晴」遮得到「林 雨 晴」', () => {
    expect(promptOf(body('我是林雨晴'), { confirmedNames: ['林 雨晴'] })).not.toMatch(/林\s*雨/u);
    expect(promptOf(body('我是林 雨 晴'), { confirmedNames: ['林雨晴'] })).not.toMatch(/雨\s*晴/u);
  });

  it('「林 雨晴 Ivy Lin」：中文去空白後仍拆出英文別名', () => {
    const prompt = promptOf(body('林雨晴 Ivy Lin 在此'), { confirmedNames: ['林 雨晴'] });
    expect(prompt).not.toContain('Ivy Lin');
  });

  it('英文姓名不分大小寫、空白可多可少', () => {
    const cases: [string, string][] = [
      ['ivy lin', 'Ivy Lin'],
      ['Ivy Lin', 'IVY LIN'],
      ['Ivy Lin', 'ivy  lin'],
    ];
    for (const [name, text] of cases) {
      const prompt = promptOf(body(`我是 ${text}。`), { confirmedNames: [name] });
      expect(prompt.toLowerCase()).not.toMatch(/ivy\s+lin/u);
    }
  });

  it('頁面姓名與既有 Profile 姓名也套同樣變體', () => {
    expect(promptOf(body('IVY LIN 在此'), { pageNames: ['Ivy Lin'] })).not.toContain('IVY LIN');
    const prompt = promptOf(body('林雨晴、ivy lin'), {
      confirmedNames: ['王確認'],
      profileNames: ['林 雨晴', 'Ivy Lin'],
    });
    expect(prompt).not.toContain('林雨晴');
    expect(prompt).not.toContain('ivy lin');
  });

  it('不分大小寫的比對要求字界：「Ann」不遮 planning／annually 裡的字母', () => {
    const prompt = promptOf(body('ANN 負責 planning annually'), { confirmedNames: ['Ann'] });
    expect(prompt).not.toContain('ANN ');
    expect(prompt).toContain('planning annually');
  });
});
