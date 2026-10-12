// P1-T069：頁首大字姓名（協調者以真實 104 PDF 實測：大字行第一段是「姓名＋空白＋標語第一個詞」）。
// 資料全為合成、去識別化。
import { describe, expect, it } from 'vitest';

import {
  PAGE1_ORDER,
  PAGE1_ROWS,
  PAGE2_ROWS,
  PAGE3_ROWS,
  page104,
  r,
} from '../__fixtures__/layout104.ts';
import type { ExtractedPage, TextLine } from '../types.ts';
import { build104 } from './layout104/build-104.ts';
import { cleanHeaderName, headerNameAlias, headerNameCandidate } from './header-name.ts';

const line = (text: string, height: number): TextLine => ({
  pageNumber: 1,
  column: 0,
  text,
  x: 40,
  y: 700,
  width: 100,
  height,
});

const page = (lines: TextLine[]): ExtractedPage => ({
  pageNumber: 1,
  width: 595,
  height: 842,
  columns: 1,
  lines,
});

describe('頁首大字姓名', () => {
  it('中文姓名後接空白與標語：只取姓名；英文姓名不切', () => {
    expect(cleanHeaderName('林測試 邏輯清晰')).toBe('林測試');
    expect(cleanHeaderName(' 林測試 ')).toBe('林測試');
    expect(cleanHeaderName('Alex Sample')).toBe('Alex Sample');
    // 切掉的部分像英文姓名：交給 AI 整理前一併遮蔽（對抗驗證）
    expect(headerNameAlias('林測試 Alex Lin 邏輯清晰')).toBe('Alex Lin');
    expect(headerNameAlias('林測試 邏輯清晰')).toBeNull();
    expect(headerNameAlias('Alex Sample')).toBeNull();
    // 英文名後接標點（P1-T078 審查 1）：整個英文名都要，結尾的句點不算
    expect(headerNameAlias('林雨晴 Ivy Lin，高雄人')).toBe('Ivy Lin');
    expect(headerNameAlias('林雨晴 Ivy Lin, from Kaohsiung')).toBe('Ivy Lin');
    expect(headerNameAlias('林雨晴 Ivy Lin.')).toBe('Ivy Lin');
  });

  it('104 版面：大字行「姓名 標語⇥…」的姓名欄只有姓名', () => {
    const rows = [
      r(117, 14.1, '林測試 邏輯清晰\t熱愛解決問題的產品人\t台北市'),
      ...PAGE1_ROWS.slice(1),
    ];
    const draft = build104([
      page104(1, rows, PAGE1_ORDER),
      page104(2, PAGE2_ROWS),
      page104(3, PAGE3_ROWS),
    ]);
    expect(draft?.personalInfo.find((row) => row.label === '姓名')?.value.value).toBe('林測試');
  });

  it('一般履歷：字高最大的第一行當姓名候選；沒有明顯較大的字就不猜', () => {
    const lines = [line('林測試 邏輯清晰', 18), line('工作經驗', 10), line('某公司', 10)];
    expect(headerNameCandidate([page(lines)])).toMatchObject({
      value: '林測試',
      source: { pageNumber: 1, lineIndex: 0 },
    });
    const flat = [line('林測試', 10), line('工作經驗', 10)];
    expect(headerNameCandidate([page(flat)])).toBeNull();
  });
});
