import { describe, expect, it } from 'vitest';

import {
  BRIDGE_SCHEMAS,
  BridgeRequest,
  BridgeRequestEnvelope,
  CONTENT_SCRIPT_OPERATIONS,
  RESUME_CAPTURE_MAX_BLOCKS,
  RESUME_CAPTURE_MAX_TEXT_BYTES,
  RESUME_CAPTURE_NAME_TEXT_MAX_CHARS,
  RESUME_CAPTURE_TIMESTAMP_MAX_CHARS,
  RESUME_CAPTURE_URL_MAX_CHARS,
  resumeCaptureTextBytes,
  utf8ByteLength,
  type ResumeCaptureBlock,
} from '../index.ts';
import { editorRequests } from './__fixtures__/editor-requests.ts';

const MiB = 1024 * 1024;
const base = editorRequests.submit_resume_capture;
const schema = BRIDGE_SCHEMAS.submit_resume_capture.request;

const withPayload = (patch: object) => ({ ...base, payload: { ...base.payload, ...patch } });
const ok = (req: unknown) => BridgeRequest.safeParse(req).success && schema.safeParse(req).success;

const para = (text: string, continues = false): ResumeCaptureBlock => ({
  kind: 'paragraph',
  level: null,
  label: null,
  text,
  continues,
});

/**
 * 上限內序列化後最大的請求：2,000 個標籤＋值區塊，標籤與文字全是 `"`（JSON 跳脫成兩個字元，最膨脹的
 * 可見字元），文字含標籤剛好 256 KiB；網址與 nameText 也取上限。
 */
function largestBlocks(extraBytes = 0): ResumeCaptureBlock[] {
  const per = Math.floor(RESUME_CAPTURE_MAX_TEXT_BYTES / RESUME_CAPTURE_MAX_BLOCKS);
  const rest = RESUME_CAPTURE_MAX_TEXT_BYTES - per * RESUME_CAPTURE_MAX_BLOCKS + extraBytes;
  return Array.from({ length: RESUME_CAPTURE_MAX_BLOCKS }, (_, i) => ({
    kind: 'label_value',
    level: null,
    label: '"',
    text: '"'.repeat(per - 1 + (i === 0 ? rest : 0)),
    continues: false,
  }));
}

const longestUrl = () => {
  const prefix = 'https://www.104.com.tw/';
  return prefix + 'a'.repeat(RESUME_CAPTURE_URL_MAX_CHARS - prefix.length);
};

describe('submit_resume_capture 請求（D28，web-resume-capture）', () => {
  it('合法請求通過；成功回應只有 { ok: true }', () => {
    expect(ok(base)).toBe(true);
    const res = BRIDGE_SCHEMAS.submit_resume_capture.response;
    expect(res.safeParse({ ok: true }).success).toBe(true);
    expect(res.safeParse({ ok: true, importId: 'x' }).success).toBe(false);
  });

  it('content script 白名單含履歷擷取（P1-T076；relay 另做操作×頁型檢查）', () => {
    expect(CONTENT_SCRIPT_OPERATIONS).toContain('submit_resume_capture');
  });

  it('區塊數與文字大小剛好在上限內通過，超過被拒', () => {
    const blocks = largestBlocks();
    expect(resumeCaptureTextBytes(blocks)).toBe(RESUME_CAPTURE_MAX_TEXT_BYTES);
    expect(ok(withPayload({ blocks }))).toBe(true);
    expect(ok(withPayload({ blocks: largestBlocks(1) }))).toBe(false);
    const tooMany = Array.from({ length: RESUME_CAPTURE_MAX_BLOCKS + 1 }, () => para('一'));
    expect(ok(withPayload({ blocks: tooMany }))).toBe(false);
    expect(ok(withPayload({ blocks: tooMany.slice(1) }))).toBe(true);
    expect(ok(withPayload({ blocks: [] }))).toBe(false);
  });

  it('文字大小以 UTF-8 計（中文 3 位元組、emoji 4 位元組），標籤也算', () => {
    expect(utf8ByteLength('a中😀')).toBe(1 + 3 + 4);
    const chinese = '中'.repeat(Math.floor(RESUME_CAPTURE_MAX_TEXT_BYTES / 6));
    const fits = [para(chinese), para(chinese)];
    expect(resumeCaptureTextBytes(fits)).toBeLessThanOrEqual(RESUME_CAPTURE_MAX_TEXT_BYTES);
    expect(ok(withPayload({ blocks: fits }))).toBe(true);
    const labelled = { kind: 'label_value', level: null, label: '中'.repeat(10), text: chinese };
    const over = [para(chinese), { ...labelled, continues: false }];
    expect(ok(withPayload({ blocks: over }))).toBe(false);
  });

  it('上限內最大的請求連信封序列化後低於 1 MiB', () => {
    const req = withPayload({
      url: longestUrl(),
      nameText: '"'.repeat(RESUME_CAPTURE_NAME_TEXT_MAX_CHARS),
      blocks: largestBlocks(),
    });
    expect(ok(req)).toBe(true);
    const envelope = { id: 'r'.repeat(64), request: req };
    expect(BridgeRequestEnvelope.safeParse(envelope).success).toBe(true);
    expect(utf8ByteLength(JSON.stringify(envelope))).toBeLessThan(MiB);
  });

  it.each<[string, object]>([
    ['kind 不在列舉', { kind: 'image' }],
    ['level 超過 6', { kind: 'heading', level: 7 }],
    ['level 為 0', { kind: 'list_item', level: 0 }],
    ['段落帶 level', { kind: 'paragraph', level: 1 }],
    ['表格列帶 level', { kind: 'table_row', level: 2 }],
    ['標題沒有 level', { kind: 'heading', level: null }],
    ['標籤＋值沒有標籤', { kind: 'label_value', label: null }],
    ['段落帶標籤', { kind: 'paragraph', label: '姓名' }],
    ['文字只有空白', { text: '　 ' }],
    ['文字含換行', { text: '第一行\n第二行' }],
    ['文字含控制字元', { text: 'a\u0001b' }],
    ['多帶 HTML 欄位', { html: '<b>x</b>' }],
    ['自帶編號', { id: 'b1' }],
  ])('區塊 %s：被拒', (_name, patch) => {
    expect(ok(withPayload({ blocks: [{ ...para('內容'), ...patch }] }))).toBe(false);
  });

  it('表格列可以用 Tab 連接儲存格；清單項 6 層通過', () => {
    const row = { kind: 'table_row', level: null, label: null, text: 'a\tb', continues: false };
    const deep = { kind: 'list_item', level: 6, label: null, text: '最內層', continues: false };
    expect(ok(withPayload({ blocks: [row, deep] }))).toBe(true);
  });

  it('continues：第一個區塊不能是續行，續行要接在同種類、層級、標籤的區塊後', () => {
    expect(ok(withPayload({ blocks: [para('a', true)] }))).toBe(false);
    expect(ok(withPayload({ blocks: [para('a'), para('b', true)] }))).toBe(true);
    const lv = (label: string, continues: boolean) => ({
      kind: 'label_value',
      level: null,
      label,
      text: '台北市',
      continues,
    });
    expect(ok(withPayload({ blocks: [lv('地址', false), lv('地址', true)] }))).toBe(true);
    expect(ok(withPayload({ blocks: [lv('地址', false), lv('電話', true)] }))).toBe(false);
    expect(ok(withPayload({ blocks: [para('a'), { ...lv('地址', true) }] }))).toBe(false);
  });

  it.each([
    'https://www.104.com.tw/profile?id=1',
    'https://www.104.com.tw/profile?',
    'https://www.104.com.tw/profile#top',
    'http://www.104.com.tw/profile',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pw@www.104.com.tw/profile',
    'https://www.104.com.tw',
    'https://WWW.104.com.tw/profile',
    'https://www.104.com.tw/a b',
    'https://www.104.com.tw/履歷',
    '',
  ])('url %s：被拒（只收 https 的 origin＋路徑）', (url) => {
    expect(ok(withPayload({ url }))).toBe(false);
  });

  it('url：正規的 origin＋路徑通過，超長被拒', () => {
    for (const url of [
      'https://www.104.com.tw/',
      'https://pda.104.com.tw/profile/preview',
      'https://www.cake.me/me/%E5%B1%A5%E6%AD%B7',
      'https://localhost:8443/x',
    ]) {
      expect(ok(withPayload({ url })), url).toBe(true);
    }
    expect(ok(withPayload({ url: longestUrl() }))).toBe(true);
    expect(ok(withPayload({ url: `${longestUrl()}a` }))).toBe(false);
  });

  it('LinkedIn 只走手動貼上（D8），不收網頁擷取', () => {
    expect(ok(withPayload({ platform: 'linkedin' }))).toBe(false);
    expect(ok(withPayload({ platform: 'cake' }))).toBe(true);
  });

  it('nameText：可為 null；只能一行、有字數上限', () => {
    expect(ok(withPayload({ nameText: null }))).toBe(true);
    expect(ok(withPayload({ nameText: '王\n小明' }))).toBe(false);
    expect(ok(withPayload({ nameText: '' }))).toBe(false);
    const long = '王'.repeat(RESUME_CAPTURE_NAME_TEXT_MAX_CHARS + 1);
    expect(ok(withPayload({ nameText: long }))).toBe(false);
  });

  it('擷取時間有長度上限：超長小數秒被拒，序列化不會超過 1 MiB（codex review）', () => {
    expect(ok(withPayload({ capturedAt: '2026-10-10T08:00:00.123456789+08:00' }))).toBe(true);
    const huge = `2026-10-10T08:00:00.${'0'.repeat(MiB)}Z`;
    expect(ok(withPayload({ capturedAt: huge }))).toBe(false);
    const justOver = `2026-10-10T08:00:00.${'0'.repeat(RESUME_CAPTURE_TIMESTAMP_MAX_CHARS - 20)}Z`;
    expect(justOver.length).toBe(RESUME_CAPTURE_TIMESTAMP_MAX_CHARS + 1);
    expect(ok(withPayload({ capturedAt: justOver }))).toBe(false);
  });

  it('擷取時間要有時區；truncated 必填', () => {
    expect(ok(withPayload({ capturedAt: '2026-10-10 08:00' }))).toBe(false);
    const rest: Record<string, unknown> = { ...base.payload };
    delete rest.truncated;
    expect(ok({ ...base, payload: rest })).toBe(false);
  });
});
