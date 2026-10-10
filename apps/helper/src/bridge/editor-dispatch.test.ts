import { BRIDGE_CHUNK_BYTES, BRIDGE_SCHEMAS } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { anyString, recordingLogger } from '../__fixtures__/requests.ts';
import { editorRequests } from './__fixtures__/editor-requests.ts';
import { dispatch } from './dispatch.ts';
import { envelope } from './envelope.ts';
import { MAX_OUTGOING_BYTES, encodeFrame } from './framing.ts';

const INVALID = { ok: false, error: { code: 'invalid_request', message: anyString } };

describe('編輯器操作分派（P1-T041）', () => {
  it.each<[string, unknown]>([
    ['ID 是路徑', { op: 'jobs.get', payload: { jobSnapshotId: '../../etc/passwd' } }],
    ['ID 是旗標', { op: 'claims.get', payload: { claimId: '--help' } }],
    [
      '候選 ID 帶參數',
      { op: 'providers.select_candidate', payload: { service: 'claude', candidateId: 'opus --x' } },
    ],
    ['資料夾選取帶路徑', { op: 'sources.pick_folders', payload: { path: '/Users' } }],
    ['PDF 選取帶路徑', { op: 'import.pick_pdf', payload: { file: '/tmp/a.pdf' } }],
    ['送出訊息（不存在）', { op: 'messages.send', payload: {} }],
  ])('%s：不進 handler，回 invalid_request，日誌不含內容', async (_name, request) => {
    const logger = recordingLogger();
    const { response } = await dispatch(request, {}, logger);
    expect(response).toEqual(INVALID);
    expect(logger.text()).not.toMatch(/passwd|--help|opus|Users|a\.pdf/);
    expect(logger.entries.some((e) => e.event === 'request_handled')).toBe(false);
  });

  it('合法編輯器請求走到 handler，回 not_implemented', async () => {
    const logger = recordingLogger();
    const { op, response } = await dispatch(editorRequests['sources.preview'], {}, logger);
    expect(op).toBe('sources.preview');
    expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
  });
});

describe('分塊：最大一塊仍可在 1 MB 框內送出', () => {
  it('export.read_pdf 最大回應可編碼成單一框', () => {
    const data = 'A'.repeat(Math.ceil(BRIDGE_CHUNK_BYTES / 3) * 4);
    const chunk = {
      index: 0,
      total: 1,
      totalBytes: BRIDGE_CHUNK_BYTES,
      sha256: 'f'.repeat(64),
      data,
    };
    const response = { ok: true, chunk };
    expect(BRIDGE_SCHEMAS['export.read_pdf'].response.safeParse(response).success).toBe(true);
    const frame = encodeFrame(envelope('r'.repeat(64), response));
    expect(frame.length).toBeLessThanOrEqual(MAX_OUTGOING_BYTES + 4);
  });
});
