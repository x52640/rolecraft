import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { BRIDGE_SCHEMAS, BridgeOperation } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { anyString } from '../__fixtures__/requests.ts';
import { editorRequests } from '../bridge/__fixtures__/editor-requests.ts';
import { connectDataDir, DATA_DIR_IN_USE_MESSAGE } from '../services/data-dir.ts';
import { DataDirInUseError } from '../services/runtime.ts';
import { HANDLERS } from './registry.ts';
import type { ProfileService } from './profile/service.ts';
import type { HelperServices } from './services.ts';

const HERE = import.meta.dirname;
const EDITOR_OPS = Object.keys(editorRequests) as (keyof typeof editorRequests)[];

/** 擷取操作的 handler 放在負責實作它們的群組目錄。 */
const CAPTURE_FILES: Record<string, string> = {
  submit_job_capture: 'jobs/submit-job-capture.ts',
  submit_message_capture: 'messages/submit-message-capture.ts',
  submit_resume_capture: 'import/submit-resume-capture.ts',
  request_draft: 'messages/request-draft.ts',
};

/** 編輯器操作 `群組.動作` → `handlers/<群組>/<動作，底線改連字號>.ts`。 */
function handlerFile(op: string): string {
  const capture = CAPTURE_FILES[op];
  if (capture) return capture;
  const [group = '', action = ''] = op.split('.');
  return `${group}/${action.replaceAll('_', '-')}.ts`;
}

describe('分派表（P1-T041）', () => {
  it('恰好涵蓋 contracts 的每個操作', () => {
    expect(Object.keys(HANDLERS).sort()).toEqual([...BridgeOperation.options].sort());
  });

  it.each(BridgeOperation.options)('%s 有自己的 handler 檔，且只處理這一個操作', (op) => {
    const file = path.join(HERE, handlerFile(op));
    expect(existsSync(file), file).toBe(true);
    const source = readFileSync(file, 'utf8');
    expect(source).toContain(`OpHandler<'${op}'>`);
    expect(source.match(/OpHandler</g)).toHaveLength(1);
  });

  /** 群組服務在、但沒有編輯器操作的方法（方法選填的群組）：handler 不得假設方法存在。 */
  const EMPTY_GROUPS: HelperServices = {
    jobs: { submitCapture: () => Promise.resolve({ jobSnapshotId: 'j-1' }) },
    resumeImport: {},
    sources: {},
    applications: {},
    providers: {},
    pdfExport: {},
    resume: {},
    analysis: {},
    intro: {},
    profile: {},
    photo: {},
    messages: {
      submitCapture: () => Promise.resolve({ messageDraftId: 'm-1' }),
      requestDraft: () => Promise.resolve({ workJobId: 'w-1' }),
    },
  };

  // 已實作的群組由 createServices 依環境接上（main.test.ts 驗接線）；這裡只驗「沒接上就不偽造成功」。
  it.each(EDITOR_OPS)('%s 沒接上服務或服務缺方法：回 not_implemented', async (op) => {
    const handler = HANDLERS[op] as (payload: unknown, s: HelperServices) => Promise<unknown>;
    for (const services of [{}, EMPTY_GROUPS]) {
      const response = await handler(editorRequests[op].payload, services);
      expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
      expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
    }
  });
});

/** D28（P1-T074）新增的操作。 */
const D28_OPS = [
  'submit_resume_capture',
  'import.latest_capture',
  'import.start_manual',
  'profile.get',
  'photo.pick',
  'photo.get',
  'photo.remove',
] as const;

describe('D28 新操作（P1-T074）', () => {
  it.each(D28_OPS)(
    '%s：資料區被另一個 helper 占用時回 helper_unavailable，不呼叫服務',
    async (op) => {
      const called: string[] = [];
      const spy = new Proxy(
        {},
        {
          get: (_target, key) => () => {
            called.push(String(key));
            return Promise.resolve(null);
          },
        },
      );
      const services = connectDataDir(
        { dataDir: '/nonexistent', fontsDir: '/f' },
        {
          open: () => {
            throw new DataDirInUseError();
          },
          assemble: () => ({}),
          withoutStorage: () => ({ resumeImport: spy, profile: spy, photo: spy }),
          notice: () => undefined,
        },
      );
      const handler = HANDLERS[op] as (payload: unknown, s: HelperServices) => Promise<unknown>;
      const response = await handler(editorRequests[op].payload, services);
      expect(response).toEqual({
        ok: false,
        error: { code: 'helper_unavailable', message: DATA_DIR_IN_USE_MESSAGE },
      });
      expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);
      expect(called).toEqual([]);
    },
  );

  it('服務接上時：handler 把服務結果轉成合法回應', async () => {
    const view = {
      photo: { id: 'p-1', format: 'jpeg', width: 600, height: 800, sha256: 'a'.repeat(64) },
      thumbnail: { mimeType: 'image/jpeg', base64: 'AAAA' },
    } as const;
    const services: HelperServices = {
      resumeImport: {
        submitResumeCapture: () => undefined,
        latestCapture: () => null,
        startManual: () => ({ importId: 'i-1' }),
      },
      profile: { get: () => ({ ok: false, reason: 'multiple_profiles' }) },
      photo: {
        pick: () => Promise.resolve({ status: 'selected', view }),
        get: () => Promise.resolve(null),
        remove: () => Promise.resolve(),
      },
    };
    const expected: Record<(typeof D28_OPS)[number], unknown> = {
      submit_resume_capture: { ok: true },
      'import.latest_capture': { ok: true, capture: null },
      'import.start_manual': { ok: true, importId: 'i-1' },
      'profile.get': {
        ok: false,
        error: {
          code: 'invalid_request',
          message: anyString,
          reason: 'multiple_profiles',
        },
      },
      'photo.pick': { ok: true, selection: { status: 'selected', ...view } },
      'photo.get': { ok: true, current: null },
      'photo.remove': { ok: true },
    };
    for (const op of D28_OPS) {
      const handler = HANDLERS[op] as (payload: unknown, s: HelperServices) => Promise<unknown>;
      const response = await handler(editorRequests[op].payload, services);
      expect(response, op).toEqual(expected[op]);
      expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success, op).toBe(true);
    }
  });

  it('photo.pick：取消與已有選取視窗開著各自回 cancelled／busy', async () => {
    for (const status of ['cancelled', 'busy'] as const) {
      const services: HelperServices = { photo: { pick: () => Promise.resolve({ status }) } };
      const response = await HANDLERS['photo.pick']({}, services);
      expect(response).toEqual({ ok: true, selection: { status } });
    }
  });
});

describe('profile.update（D30，P1-T090）', () => {
  const update = HANDLERS['profile.update'] as (p: unknown, s: HelperServices) => Promise<unknown>;
  const payload = editorRequests['profile.update'].payload;

  it('資料區被另一個 helper 占用時回 helper_unavailable，不呼叫服務', async () => {
    const called: string[] = [];
    const spy = { update: () => called.push('update') };
    const services = connectDataDir(
      { dataDir: '/nonexistent', fontsDir: '/f' },
      {
        open: () => {
          throw new DataDirInUseError();
        },
        assemble: () => ({}),
        withoutStorage: () => ({ profile: spy as unknown as ProfileService }),
        notice: () => undefined,
      },
    );
    const response = await update(payload, services);
    expect(response).toEqual({
      ok: false,
      error: { code: 'helper_unavailable', message: DATA_DIR_IN_USE_MESSAGE },
    });
    expect(called).toEqual([]);
  });

  it.each([
    ['profile_conflict', 'profile_conflict'],
    ['profile_missing', 'profile_missing'],
    ['multiple_profiles', 'multiple_profiles'],
    ['bad_source_row', undefined],
    ['empty_profile', undefined],
  ] as const)('服務回 %s：invalid_request＋固定原因 %s', async (refusal, reason) => {
    const services: HelperServices = {
      profile: { update: () => ({ ok: false, reason: refusal }) },
    };
    const response = await update(payload, services);
    expect(response).toEqual({
      ok: false,
      error: { code: 'invalid_request', message: anyString, ...(reason ? { reason } : {}) },
    });
    expect(BRIDGE_SCHEMAS['profile.update'].response.safeParse(response).success).toBe(true);
  });
});
