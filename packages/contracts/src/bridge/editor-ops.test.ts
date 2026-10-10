import { describe, expect, it } from 'vitest';

import {
  BRIDGE_CHUNK_BYTES,
  BRIDGE_MAX_CHUNKS,
  BRIDGE_SCHEMAS,
  BinaryChunk,
  BridgeOperation,
  BridgeRequest,
  CONTENT_SCRIPT_OPERATIONS,
  MAX_IDS_PER_REQUEST,
  OpaqueId,
} from '../index.ts';
import { editorRequests } from './__fixtures__/editor-requests.ts';

const LEGACY = ['submit_job_capture', 'submit_message_capture', 'request_draft'];
const entries = Object.entries(editorRequests);
const MB = 1024 * 1024;

/** 只回傳 payload 中以 Id 結尾、值為字串的鍵（指向既有物件的不透明 ID）。 */
function idKeys(payload: object): string[] {
  return Object.entries(payload)
    .filter(([key, value]) => key.endsWith('Id') && typeof value === 'string')
    .map(([key]) => key);
}

describe('編輯器操作清單（P1-T041）', () => {
  it('fixture 涵蓋除了擷取三個操作以外的全部操作', () => {
    const editorOps = BridgeOperation.options.filter((op) => !LEGACY.includes(op));
    expect(Object.keys(editorRequests).sort()).toEqual([...editorOps].sort());
  });

  it('編輯器操作以「群組.動作」命名，群組只有既定九組', () => {
    const groups = new Set(Object.keys(editorRequests).map((op) => op.split('.')[0]));
    expect([...groups].sort()).toEqual(
      [
        'applications',
        'claims',
        'export',
        'import',
        'jobs',
        'messages',
        'providers',
        'resume',
        'sources',
      ].sort(),
    );
  });

  it('content script 只能用職缺／訊息擷取', () => {
    expect([...CONTENT_SCRIPT_OPERATIONS].sort()).toEqual([
      'submit_job_capture',
      'submit_message_capture',
    ]);
  });

  it('沒有送出、投遞、執行、讀檔類操作', () => {
    const banned = /send|submit_application|apply|exec|run|shell|read_file|write|open_url/;
    const editorOps = BridgeOperation.options.filter((op) => !LEGACY.includes(op));
    expect(editorOps.filter((op) => banned.test(op))).toEqual([]);
  });

  it.each(entries)('%s 合法請求通過', (op, req) => {
    expect(BRIDGE_SCHEMAS[op as BridgeOperation].request.safeParse(req).success).toBe(true);
    expect(BridgeRequest.safeParse(req).success).toBe(true);
  });

  it.each(entries)('%s 頂層與 payload 多帶欄位被拒', (_op, req) => {
    expect(BridgeRequest.safeParse({ ...req, cwd: '/tmp' }).success).toBe(false);
    const bad = { ...req, payload: { ...req.payload, path: '/etc/passwd' } };
    expect(BridgeRequest.safeParse(bad).success).toBe(false);
  });

  it.each(entries)('%s 的 ID 欄位不接受路徑、旗標或空白', (_op, req) => {
    for (const key of idKeys(req.payload)) {
      for (const value of ['../etc/passwd', '/etc/passwd', '-rf', 'a b', 'a.b', '', '~']) {
        const bad = { ...req, payload: { ...req.payload, [key]: value } };
        expect(BridgeRequest.safeParse(bad).success, `${key}=${value}`).toBe(false);
      }
    }
  });

  it('OpaqueId：UUID 通過，長度與字元受限', () => {
    expect(OpaqueId.safeParse('0f8fa5c4-3b1e-4c56-9d1a-7a2b9c3d4e5f').success).toBe(true);
    expect(OpaqueId.safeParse('a'.repeat(128)).success).toBe(true);
    expect(OpaqueId.safeParse('a'.repeat(129)).success).toBe(false);
    expect(OpaqueId.safeParse('C:\\x').success).toBe(false);
    expect(OpaqueId.safeParse('a\n').success).toBe(false);
  });
});

describe('個別規則', () => {
  it('sources.update_authorization：不得空、不得同一項同時授權與撤銷、ID 不得是路徑', () => {
    const req = editorRequests['sources.update_authorization'];
    const withPayload = (p: object) => ({ ...req, payload: { ...req.payload, ...p } });
    expect(BridgeRequest.safeParse(withPayload({ authorize: [], revoke: [] })).success).toBe(false);
    const id = req.payload.authorize[0];
    expect(BridgeRequest.safeParse(withPayload({ revoke: [id] })).success).toBe(false);
    expect(BridgeRequest.safeParse(withPayload({ authorize: ['/Users/x'] })).success).toBe(false);
    const tooMany = Array.from({ length: 5001 }, (_, i) => `id${i}`);
    expect(BridgeRequest.safeParse(withPayload({ authorize: tooMany })).success).toBe(false);
  });

  it('providers：服務是封閉列舉；候選 ID 不得帶旗標或空白', () => {
    const req = editorRequests['providers.select_candidate'];
    const svc = { ...req, payload: { ...req.payload, service: 'openai-api' } };
    expect(BridgeRequest.safeParse(svc).success).toBe(false);
    const flag = { ...req, payload: { ...req.payload, candidateId: '--dangerously-skip' } };
    expect(BridgeRequest.safeParse(flag).success).toBe(false);
  });

  it('claims.confirm：完成狀態只能是使用者確認完成或計畫中', () => {
    const req = editorRequests['claims.confirm'];
    for (const completion of ['documented_done', 'unknown']) {
      const bad = { ...req, payload: { ...req.payload, completion } };
      expect(BridgeRequest.safeParse(bad).success).toBe(false);
    }
    const noTime = { ...req, payload: { ...req.payload, confirmedAt: '2026-10-10T00:00:00Z' } };
    expect(BridgeRequest.safeParse(noTime).success).toBe(false);
  });

  it('import.confirm：呼叫端不能自己設 pdfParseConfirmed 或 id', () => {
    const req = editorRequests['import.confirm'];
    for (const extra of [{ pdfParseConfirmed: true }, { id: 'p-1' }]) {
      const bad = {
        ...req,
        payload: { ...req.payload, profile: { ...req.payload.profile, ...extra } },
      };
      expect(BridgeRequest.safeParse(bad).success).toBe(false);
    }
  });

  it('export.read_pdf：塊序號有上下限', () => {
    const req = editorRequests['export.read_pdf'];
    for (const chunkIndex of [-1, BRIDGE_MAX_CHUNKS, 1.5]) {
      const bad = { ...req, payload: { ...req.payload, chunkIndex } };
      expect(BridgeRequest.safeParse(bad).success).toBe(false);
    }
  });

  it('回應：成功形狀 strict，失敗形狀共用', () => {
    const res = BRIDGE_SCHEMAS['jobs.confirm'].response;
    expect(res.safeParse({ ok: true }).success).toBe(true);
    expect(res.safeParse({ ok: true, extra: 1 }).success).toBe(false);
    const fail = { ok: false, error: { code: 'not_implemented', message: 'x' } };
    expect(res.safeParse(fail).success).toBe(true);
  });
});

describe('對抗驗證修正：請求 ID 一律 OpaqueId、職缺網址限 http(s)', () => {
  const BAD_IDS = ['../etc/passwd', '/etc/passwd', '-rf', '--help', 'a b', ''];

  it('resume.edit_section：巢狀 claimId 拒路徑／旗標，引用超量被拒，引用多帶欄位被拒', () => {
    const req = editorRequests['resume.edit_section'];
    const withCitations = (citations: unknown[]) => ({
      ...req,
      payload: { ...req.payload, citations },
    });
    for (const claimId of BAD_IDS) {
      expect(BridgeRequest.safeParse(withCitations([{ claimId }])).success, claimId).toBe(false);
    }
    const id = req.payload.citations[0].claimId;
    const many = Array.from({ length: MAX_IDS_PER_REQUEST + 1 }, () => ({ claimId: id }));
    expect(BridgeRequest.safeParse(withCitations(many)).success).toBe(false);
    const atLimit = many.slice(1);
    expect(BridgeRequest.safeParse(withCitations(atLimit)).success).toBe(true);
    expect(BridgeRequest.safeParse(withCitations([{ claimId: id, path: '/x' }])).success).toBe(
      false,
    );
  });

  it('request_draft.messageDraftId 與 submit_message_capture.jobSnapshotId 拒路徑／旗標', () => {
    for (const bad of BAD_IDS) {
      const draft = { op: 'request_draft', payload: { messageDraftId: bad, replyIntent: 'x' } };
      expect(BridgeRequest.safeParse(draft).success, bad).toBe(false);
      const msg = {
        op: 'submit_message_capture',
        payload: {
          platform: 'cake',
          captureMethod: 'manual_paste',
          selectedMessageText: '您好',
          jobSnapshotId: bad,
        },
      };
      expect(BridgeRequest.safeParse(msg).success, bad).toBe(false);
    }
  });

  it('既有擷取格式仍相容：短 ID 與 null', () => {
    for (const messageDraftId of ['m', 'm-1', '0f8fa5c4-3b1e-4c56-9d1a-7a2b9c3d4e5f']) {
      const draft = { op: 'request_draft', payload: { messageDraftId, replyIntent: 'x' } };
      expect(BridgeRequest.safeParse(draft).success).toBe(true);
    }
  });

  it('submit_job_capture.url：file:、javascript:、data: 被拒，http(s) 與 null 通過', () => {
    const job = (url: string | null) => ({
      op: 'submit_job_capture',
      payload: {
        platform: '104',
        url,
        captureMethod: 'manual_paste',
        capturedAt: '2026-10-10T08:00:00+08:00',
        fields: editorRequests['jobs.update'].payload.fields,
      },
    });
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<b>x</b>']) {
      expect(BridgeRequest.safeParse(job(url)).success, url).toBe(false);
    }
    for (const url of ['https://www.104.com.tw/job/abc', 'http://example.com/job', null]) {
      expect(BridgeRequest.safeParse(job(url)).success, String(url)).toBe(true);
    }
  });
});

describe('分塊（BinaryChunk）', () => {
  const sha256 = 'a'.repeat(64);
  // 'A' 是合法 base64 字元；長度＝一塊原始位元組 base64 後的上限。
  const maxLen = Math.ceil(BRIDGE_CHUNK_BYTES / 3) * 4;
  const maxData = 'A'.repeat(maxLen);
  const chunk = { index: 0, total: 1, totalBytes: BRIDGE_CHUNK_BYTES, sha256, data: maxData };

  it('最大一塊合法，且整則回應信封低於 1 MB', () => {
    expect(BinaryChunk.safeParse(chunk).success).toBe(true);
    const envelope = { id: 'r'.repeat(64), response: { ok: true, chunk } };
    // 內容全是 ASCII，字串長度＝位元組數。
    expect(JSON.stringify(envelope).length).toBeLessThan(MB);
    const res = BRIDGE_SCHEMAS['export.read_pdf'].response;
    expect(res.safeParse({ ok: true, chunk }).success).toBe(true);
  });

  it.each<[string, object]>([
    ['index 超出 total', { index: 1, total: 1 }],
    ['total 超過上限', { total: BRIDGE_MAX_CHUNKS + 1 }],
    ['data 超過一塊', { data: 'A'.repeat(maxLen + 4) }],
    ['data 不是 base64', { data: '../../etc/passwd' }],
    ['雜湊不是 SHA-256', { sha256: 'xyz' }],
    ['總位元組數超過塊數容量', { totalBytes: BRIDGE_CHUNK_BYTES + 1 }],
    ['多帶欄位', { path: '/tmp/x.pdf' }],
  ])('%s：被拒', (_name, patch) => {
    expect(BinaryChunk.safeParse({ ...chunk, ...patch }).success).toBe(false);
  });
});
