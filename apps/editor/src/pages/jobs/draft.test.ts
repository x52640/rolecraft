import { JobFields } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { draftFromFields, emptyDraft, fieldsFromDraft, sameDraft } from './draft.ts';
import { sampleSnapshot } from './fake-bridge.test-helpers.ts';

const fields = sampleSnapshot().fields;

describe('職缺欄位草稿', () => {
  it('欄位 → 草稿 → 欄位不變，且符合 contracts', () => {
    const back = fieldsFromDraft(draftFromFields(fields));
    expect(back).toEqual({ ok: true, fields });
    expect(back.ok && JobFields.safeParse(back.fields).success).toBe(true);
  });

  it('手動貼上空白選用欄位預設「未擷取到」，不替頁面斷言沒提供', () => {
    const draft = { ...emptyDraft(), company: 'A', title: 'B', description: 'C' };
    const result = fieldsFromDraft(draft);
    expect(result.ok && result.fields.location).toEqual({ status: 'not_captured' });
  });

  it('只有空白的選用欄位依選擇標示；有內容就是內容', () => {
    const draft = draftFromFields(fields);
    draft.location = { value: '  \n', emptyStatus: 'not_provided' };
    draft.requirements = { value: '三年經驗', emptyStatus: 'not_captured' };
    const result = fieldsFromDraft(draft);
    expect(result.ok && result.fields.location).toEqual({ status: 'not_provided' });
    expect(result.ok && result.fields.requirements).toEqual({
      status: 'captured',
      value: '三年經驗',
    });
  });

  it('必要欄位只有空白：回錯誤', () => {
    expect(fieldsFromDraft({ ...draftFromFields(fields), title: ' \t' })).toEqual({
      ok: false,
      errors: { title: '必填，不可空白' },
    });
  });

  it('sameDraft：空白欄位的暫存文字不同但結果相同時視為未改', () => {
    const a = draftFromFields(fields);
    const b = { ...a, requirements: { value: '   ', emptyStatus: 'not_captured' as const } };
    expect(sameDraft(a, b)).toBe(true);
    expect(sameDraft(a, { ...a, title: '別的' })).toBe(false);
  });
});
