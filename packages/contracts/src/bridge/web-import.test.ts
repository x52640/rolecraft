import { describe, expect, it } from 'vitest';

import {
  BRIDGE_PICKER_OPERATIONS,
  BRIDGE_SCHEMAS,
  BridgeFailure,
  BridgeRequest,
  ExportVersion,
  IMPORT_AI_PARSE_MAX_NAMES,
  IMPORT_AI_PARSE_NAME_MAX_CHARS,
  ImportAiParseView,
  ImportResult,
  PHOTO_THUMBNAIL_MAX_BYTES,
  RESUME_CAPTURE_MAX_BLOCKS,
  RESUME_CAPTURE_MAX_TEXT_BYTES,
  importSourceOf,
  utf8ByteLength,
} from '../index.ts';
import { editorRequests } from './__fixtures__/editor-requests.ts';

const MiB = 1024 * 1024;
const T = '2026-10-10T08:00:00.000Z';
const get = BRIDGE_SCHEMAS['import.get'].response;

const block = (i: number, text: string) => ({
  id: `b${i + 1}`,
  kind: 'label_value',
  level: null,
  label: '"',
  text,
  continues: false,
});

const webResult = (blocks: object[]) => ({
  status: 'web_capture',
  displayName: '網頁：104',
  platform: '104',
  capturedAt: T,
  truncated: false,
  blocks,
});

describe('import.get：分辨 PDF、網頁、手動三種來源（D28／W4）', () => {
  it('網頁來源回區塊清單與截斷；手動來源沒有原文', () => {
    const web = webResult([block(0, '前端工程師')]);
    expect(get.safeParse({ ok: true, result: web }).success).toBe(true);
    expect(importSourceOf(ImportResult.parse(web))).toBe('web');
    const manual = { status: 'manual', displayName: '手動輸入' };
    expect(get.safeParse({ ok: true, result: manual }).success).toBe(true);
    expect(importSourceOf(ImportResult.parse(manual))).toBe('manual');
    const failed = { status: 'failed', displayName: 'r.pdf', reason: 'encrypted' };
    expect(importSourceOf(ImportResult.parse(failed))).toBe('pdf');
  });

  it('區塊編號必須依序 b1、b2…；不帶網址或 nameText', () => {
    const swapped = webResult([block(1, 'a'), block(0, 'b')]);
    expect(ImportResult.safeParse(swapped).success).toBe(false);
    for (const extra of [{ url: 'https://www.104.com.tw/x' }, { nameText: '王小明' }]) {
      const bad = { ...webResult([block(0, 'a')]), ...extra };
      expect(ImportResult.safeParse(bad).success).toBe(false);
    }
  });

  it('上限內最大的擷取，對應的 import.get 回應連信封低於 1 MiB', () => {
    const per = RESUME_CAPTURE_MAX_TEXT_BYTES / RESUME_CAPTURE_MAX_BLOCKS;
    const blocks = Array.from({ length: RESUME_CAPTURE_MAX_BLOCKS }, (_, i) =>
      block(i, '"'.repeat(Math.floor(per) - 1)),
    );
    const response = { ok: true, result: { ...webResult(blocks), truncated: true } };
    expect(get.safeParse(response).success).toBe(true);
    const envelope = JSON.stringify({ id: 'r'.repeat(64), response });
    expect(utf8ByteLength(envelope)).toBeLessThan(MiB);
  });

  it('PDF 既有形狀照舊通過（不帶新欄位）', () => {
    const field = { value: '王小明', pageNumber: 1, lineIndex: 0 };
    const draft = {
      name: field,
      dates: [],
      companies: [],
      titles: [],
      experiences: [],
      skills: [],
    };
    const parsed = {
      status: 'parsed',
      displayName: 'r.pdf',
      pages: [{ pageNumber: 1, lines: ['王小明'] }],
      pagesWithoutText: [],
      draft,
    };
    expect(get.safeParse({ ok: true, result: parsed }).success).toBe(true);
  });
});

const webField = (blockId: string, containsPersonalData = false) => ({
  value: '值',
  blockId,
  containsPersonalData,
});
const webDraft = {
  personalInfo: [{ label: '姓名', value: webField('b1', true) }],
  education: [webField('b2')],
  experiences: [
    {
      company: webField('b3'),
      title: null,
      startDate: webField('b4'),
      endDate: null,
      current: true,
      description: webField('b5', true),
    },
  ],
  skills: [],
  otherSections: [{ heading: webField('b6'), body: webField('b7') }],
  discarded: [{ field: '第 1 段經歷職稱', reason: 'not_in_source' }],
};

describe('import.ai_status：網頁來源草稿（D28／W7）', () => {
  const view = (patch: object) => ({ state: 'succeeded', failure: null, draft: null, ...patch });

  it('網頁來源成功：草稿在 webDraft，欄位出處是區塊編號、帶還原個資旗標', () => {
    expect(ImportAiParseView.safeParse(view({ source: 'web', webDraft })).success).toBe(true);
    const res = BRIDGE_SCHEMAS['import.ai_status'].response;
    expect(res.safeParse({ ok: true, parse: view({ source: 'web', webDraft }) }).success).toBe(
      true,
    );
  });

  it.each<[string, object]>([
    ['網頁草稿卻標 PDF', { source: 'pdf', webDraft }],
    ['網頁草稿沒標來源', { webDraft }],
    ['成功卻沒有草稿', { source: 'web', webDraft: null }],
    ['失敗卻帶草稿', { source: 'web', webDraft, state: 'failed', failure: 'invalid_output' }],
    [
      '出處是頁碼',
      {
        source: 'web',
        webDraft: { ...webDraft, education: [{ value: 'x', pageNumber: 1, lineIndex: 0 }] },
      },
    ],
    ['區塊編號格式不對', { source: 'web', webDraft: { ...webDraft, skills: [webField('12')] } }],
    [
      '少了還原個資旗標',
      { source: 'web', webDraft: { ...webDraft, skills: [{ value: 'x', blockId: 'b1' }] } },
    ],
  ])('%s：被拒', (_name, patch) => {
    expect(ImportAiParseView.safeParse(view(patch)).success).toBe(false);
  });

  it('既有 PDF 回應（沒有 source、webDraft）照舊通過；執行中的網頁整理也通過', () => {
    const running = { state: 'running', failure: null, draft: null };
    expect(ImportAiParseView.safeParse(running).success).toBe(true);
    expect(ImportAiParseView.safeParse({ ...running, source: 'web', webDraft: null }).success).toBe(
      true,
    );
  });
});

describe('import.ai_parse／latest_capture／start_manual 請求與回應', () => {
  const req = editorRequests['import.ai_parse'];
  const withNames = (names: unknown) => ({ ...req, payload: { ...req.payload, names } });

  it('選填姓名：可多個寫法，個數與字數有上限', () => {
    expect(BridgeRequest.safeParse(req).success).toBe(true);
    expect(BridgeRequest.safeParse(withNames(['林測試', 'Alex Lin'])).success).toBe(true);
    const many = Array.from({ length: IMPORT_AI_PARSE_MAX_NAMES + 1 }, () => '王');
    for (const bad of [
      [],
      many,
      ['王\n小明'],
      [' '],
      ['王'.repeat(IMPORT_AI_PARSE_NAME_MAX_CHARS + 1)],
    ]) {
      expect(BridgeRequest.safeParse(withNames(bad)).success).toBe(false);
    }
  });

  it('latest_capture 回擷取摘要或 null；start_manual 回 importId', () => {
    const latest = BRIDGE_SCHEMAS['import.latest_capture'].response;
    const capture = { importId: 'i-1', platform: '104', capturedAt: T, truncated: true };
    expect(latest.safeParse({ ok: true, capture }).success).toBe(true);
    expect(latest.safeParse({ ok: true, capture: null }).success).toBe(true);
    expect(latest.safeParse({ ok: true, capture: { ...capture, blocks: [] } }).success).toBe(false);
    const manual = BRIDGE_SCHEMAS['import.start_manual'].response;
    expect(manual.safeParse({ ok: true, importId: 'i-2' }).success).toBe(true);
  });
});

describe('profile.get 與固定失敗原因', () => {
  const res = BRIDGE_SCHEMAS['profile.get'].response;
  const profile = {
    id: 'p-1',
    personalInfo: { 姓名: '王小明' },
    experiences: [],
    skills: [],
    pdfParseConfirmed: true,
  };

  it('只回已確認的 Profile 或 null', () => {
    expect(res.safeParse({ ok: true, profile }).success).toBe(true);
    expect(res.safeParse({ ok: true, profile: null }).success).toBe(true);
    const unconfirmed = { ...profile, pdfParseConfirmed: false };
    expect(res.safeParse({ ok: true, profile: unconfirmed }).success).toBe(false);
  });

  it('多份 Profile：invalid_request＋固定原因；原因只配 invalid_request', () => {
    const fail = (code: string, reason?: string) => ({
      ok: false,
      error: { code, message: '固定文字', ...(reason ? { reason } : {}) },
    });
    expect(res.safeParse(fail('invalid_request', 'multiple_profiles')).success).toBe(true);
    expect(BridgeFailure.safeParse(fail('invalid_request', 'name_required')).success).toBe(true);
    expect(BridgeFailure.safeParse(fail('internal_error', 'multiple_profiles')).success).toBe(
      false,
    );
    expect(BridgeFailure.safeParse(fail('invalid_request', 'teapot')).success).toBe(false);
    expect(BridgeFailure.safeParse(fail('not_implemented')).success).toBe(true);
  });
});

describe('photo.*（D28）', () => {
  const photo = { id: 'p-1', format: 'jpeg', width: 1200, height: 900, sha256: 'a'.repeat(64) };
  const maxBase64 = 'A'.repeat(Math.ceil(PHOTO_THUMBNAIL_MAX_BYTES / 3) * 4);
  const thumbnail = { mimeType: 'image/jpeg', base64: maxBase64 };

  it('photo.pick 是選取器操作', () => {
    expect(BRIDGE_PICKER_OPERATIONS).toContain('photo.pick');
  });

  it('pick：selected／cancelled／busy；最大縮圖的回應低於 1 MiB', () => {
    const res = BRIDGE_SCHEMAS['photo.pick'].response;
    const selected = { ok: true, selection: { status: 'selected', photo, thumbnail } };
    expect(res.safeParse(selected).success).toBe(true);
    expect(JSON.stringify({ id: 'r'.repeat(64), response: selected }).length).toBeLessThan(MiB);
    for (const status of ['cancelled', 'busy']) {
      expect(res.safeParse({ ok: true, selection: { status } }).success).toBe(true);
    }
  });

  it('get：照片資訊＋縮圖或 null；縮圖超量、尺寸超過 1200、格式不是 JPEG 被拒', () => {
    const res = BRIDGE_SCHEMAS['photo.get'].response;
    expect(res.safeParse({ ok: true, current: { photo, thumbnail } }).success).toBe(true);
    expect(res.safeParse({ ok: true, current: null }).success).toBe(true);
    const bad = [
      { photo, thumbnail: { ...thumbnail, base64: `${maxBase64}AAAA` } },
      { photo: { ...photo, width: 1201 }, thumbnail },
      { photo: { ...photo, format: 'png' }, thumbnail },
      { photo, thumbnail: { ...thumbnail, mimeType: 'image/png' } },
    ];
    for (const current of bad) expect(res.safeParse({ ok: true, current }).success).toBe(false);
  });

  it('匯出版本相加選填照片 ID 與雜湊（R3），兩者要一起出現', () => {
    const ref = ExportVersion.shape.photo;
    expect(ref.safeParse(undefined).success).toBe(true);
    expect(ref.safeParse({ photoId: 'p-1', sha256: 'a'.repeat(64) }).success).toBe(true);
    expect(ref.safeParse({ photoId: 'p-1' }).success).toBe(false);
  });

  it('請求沒有任何欄位（不收路徑）', () => {
    for (const op of ['photo.pick', 'photo.get', 'photo.remove'] as const) {
      expect(BridgeRequest.safeParse({ op, payload: {} }).success).toBe(true);
      const withPath = { op, payload: { source: '/Users/x/me.jpg' } };
      expect(BridgeRequest.safeParse(withPath).success).toBe(false);
    }
  });
});
