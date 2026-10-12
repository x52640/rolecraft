import { describe, expect, it } from 'vitest';

import {
  baseInfoValue,
  baseOf,
  infoSource,
  isDirty,
  toPayload,
  unmatchedExperiences,
  validate,
} from './profile-model.ts';
import { sampleProfile } from './profile.test-helpers.ts';

describe('profile-model', () => {
  const base = baseOf(sampleProfile());

  it('讀到的內容原樣轉回請求：每列指回自己、沒有修改、不含出處', () => {
    const payload = toPayload(base.form, base);
    expect(payload.baseVersion).toBe(3);
    expect(payload.experiences.map((e) => e.from)).toEqual([0, 1]);
    expect(payload.experiences[0]?.endDate).toBeNull();
    expect(payload.personalInfo.map((r) => r.from)).toEqual(['姓名', 'Email', '學歷']);
    expect(Object.keys(payload).sort()).toEqual([
      'baseVersion',
      'experiences',
      'personalInfo',
      'skills',
    ]);
    expect(isDirty(base, base.form)).toBe(false);
    expect(validate(base.form, base)).toBeNull();
  });

  it('舊資料沒有版本號視為 0', () => {
    expect(baseOf(sampleProfile({ version: undefined })).version).toBe(0);
  });

  it('只改描述、結束不算對不到；改開始、刪整段才算', () => {
    const [first, second] = base.form.experiences;
    if (!first || !second) throw new Error('樣本應有兩段經歷');
    const desc = { ...base.form, experiences: [{ ...first, description: 'x' }, second] };
    expect(unmatchedExperiences(base, desc)).toEqual({ changed: [], removed: [] });
    const start = { ...base.form, experiences: [{ ...first, startDate: '2021-04' }] };
    expect(unmatchedExperiences(base, start)).toEqual({
      changed: ['甲公司｜前端工程師'],
      removed: ['乙公司｜實習生'],
    });
  });

  it('欄位名稱重複、內容全空不通過', () => {
    const info = base.form.info.map((r) => ({ ...r, label: '姓名' }));
    expect(validate({ ...base.form, info }, base)).toContain('不能重複');
    expect(validate({ info: [], experiences: [], skills: [] }, base)).toContain('內容全空');
  });

  it('只修剪改過的欄位：沒動的欄位帶頭尾空白也原樣送回、不算修改', () => {
    const padded = baseOf(
      sampleProfile({
        personalInfo: { ' 姓名 ': ' 王小明 ', 學歷: '某大學\n資訊工程學系' },
        skills: [' TypeScript ', 'React'],
        sources: undefined,
      }),
    );
    const untouched = toPayload(padded.form, padded);
    expect(untouched.personalInfo).toEqual([
      { label: ' 姓名 ', value: ' 王小明 ', from: ' 姓名 ' },
      { label: '學歷', value: '某大學\n資訊工程學系', from: '學歷' },
    ]);
    expect(untouched.skills[0]?.value).toBe(' TypeScript ');
    expect(isDirty(padded, padded.form)).toBe(false);
    expect(validate(padded.form, padded)).toBeNull();
    const [, react] = padded.form.skills;
    if (!react) throw new Error('樣本應有兩項技能');
    const edited = { ...padded.form, skills: [{ ...react, value: '  Vue  ' }] };
    expect(toPayload(edited, padded).skills).toEqual([{ value: 'Vue', from: 1 }]);
  });

  it('標籤是 constructor、toString 等：不取到繼承成員', () => {
    const odd = baseOf(
      sampleProfile({ personalInfo: { constructor: 'x', toString: 'y' }, sources: undefined }),
    );
    expect(infoSource(odd, 'constructor')).toBeNull();
    expect(infoSource(base, 'toString')).toBeNull();
    expect(baseInfoValue(base, 'constructor')).toBeUndefined();
    expect(isDirty(odd, odd.form)).toBe(false);
  });
});
