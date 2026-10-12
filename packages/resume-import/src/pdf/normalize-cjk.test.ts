import { describe, expect, it } from 'vitest';

import { normalizeCjkLookalikes } from './normalize-cjk.ts';

describe('部首相似字還原', () => {
  it('康熙部首與部首補充換回一般漢字', () => {
    expect(normalizeCjkLookalikes('⼯作經驗')).toBe('工作經驗');
    expect(normalizeCjkLookalikes('專⻑')).toBe('專長');
    expect(normalizeCjkLookalikes('⾃傳、語⾔能⼒、客⼾')).toBe('自傳、語言能力、客戶');
  });

  it('全形標點、數字與一般文字不變', () => {
    const text = '姓名：王小明（２０２４年）ABC，100%';
    expect(normalizeCjkLookalikes(text)).toBe(text);
  });
});
