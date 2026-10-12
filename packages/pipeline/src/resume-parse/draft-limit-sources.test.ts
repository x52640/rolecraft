// P1-T090 審查：草稿 512 KiB 上限（D28 W3）量測時不算 D30 加的額外出處（moreLines／moreBlockIds），
// 維持 T069／T078／T080 原判定；判定通過但連同額外出處超過上限時拿掉額外出處（回應仍在上限內）。
// 資料全為合成；一律用假 provider，不呼叫真實 CLI。
import { IMPORT_AI_DRAFT_MAX_BYTES, utf8ByteLength } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { prepareResumeParse } from './prepare.ts';
import { draftFitsLimit, runResumeParse, runWebResumeParse } from './run.ts';
import { f, fakeDeps, inputsOf, p, prepareWeb } from './web-fixtures.test-helpers.ts';

const EMPTY = { education: [], experiences: [], skills: [], sections: [] };
/** 模型輸出上限內的極端：每段內文引用 400 個區塊（每欄上限），60 段（段落上限）。 */
const LINES = Array.from({ length: 400 }, (_, i) => `測試內容${String(i).padStart(3, '0')}`);
const bytes = (draft: unknown) => utf8ByteLength(JSON.stringify(draft));

/** n 個其他段落，每段內文引用全部 400 個短區塊。 */
function webOutput(n: number) {
  const ids = LINES.map((_, i) => `b${String(i + 2)}`);
  const section = { heading: f('自傳', 'b1'), body: f(LINES.join('\n'), ...ids) };
  return JSON.stringify({ ...EMPTY, sections: Array.from({ length: n }, () => section) });
}

const webInput = () =>
  prepareWeb(inputsOf([p('自傳'), ...LINES.map((t) => p(t))], { confirmedNames: ['林測試'] }));

async function runWeb(n: number) {
  const { deps } = fakeDeps({ text: webOutput(n) });
  return runWebResumeParse(webInput(), deps);
}

describe('草稿大小上限不算額外出處（P1-T090 審查）', () => {
  it('網頁：不算額外出處在上限內、算進去才超過 → 照原判定通過，回傳的草稿拿掉額外出處且在上限內', async () => {
    const result = await runWeb(60);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.draft.otherSections[0]?.body;
    expect(body?.blockId).toBe('b2');
    expect(body).not.toHaveProperty('moreBlockIds');
    expect(bytes(result.draft)).toBeLessThanOrEqual(IMPORT_AI_DRAFT_MAX_BYTES);
    expect(draftFitsLimit(result.draft)).toBe(true);
  });

  it('連同額外出處也在上限內：保留額外出處', async () => {
    const result = await runWeb(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.otherSections[0]?.body.moreBlockIds).toHaveLength(LINES.length - 1);
  });

  it('不算額外出處也超過上限：照原判定整份失敗', async () => {
    const big = '測'.repeat(5000);
    const input = prepareWeb(inputsOf([p('自傳'), p(big)], { confirmedNames: ['林測試'] }));
    const section = { heading: f('自傳', 'b1'), body: f(big, 'b2') };
    const { deps } = fakeDeps({
      text: JSON.stringify({ ...EMPTY, sections: Array.from({ length: 40 }, () => section) }),
    });
    expect(await runWebResumeParse(input, deps)).toEqual({ ok: false, failure: 'invalid_output' });
  });

  it('PDF 同樣：額外出處（moreLines）不算進上限', async () => {
    const prepared = prepareResumeParse(
      { pages: [{ pageNumber: 1, lines: ['自傳', ...LINES] }], names: [], personalHints: [] },
      budget(1_000_000),
      idSource(),
    );
    if (!prepared.ok) throw new Error(prepared.reason);
    const ids = LINES.map((_, i) => `1-${String(i + 2)}`);
    const section = { heading: f('自傳', '1-1'), body: f(LINES.join('\n'), ...ids) };
    const { deps } = fakeDeps({
      // moreLines 每項約 33 位元組（頁碼＋行號），40 段就足以讓連同額外出處超過上限
      text: JSON.stringify({ ...EMPTY, sections: Array.from({ length: 40 }, () => section) }),
    });
    const result = await runResumeParse(prepared.prepared, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.otherSections[0]?.body).not.toHaveProperty('moreLines');
    expect(draftFitsLimit(result.draft)).toBe(true);
  });
});
