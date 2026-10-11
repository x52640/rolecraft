import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { BRIDGE_SCHEMAS, BridgeOperation } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { editorRequests } from '../bridge/__fixtures__/editor-requests.ts';
import { HANDLERS } from './registry.ts';
import type { HelperServices } from './services.ts';

const HERE = import.meta.dirname;
const EDITOR_OPS = Object.keys(editorRequests) as (keyof typeof editorRequests)[];

/** 擷取三個操作的 handler 放在負責實作它們的群組目錄。 */
const CAPTURE_FILES: Record<string, string> = {
  submit_job_capture: 'jobs/submit-job-capture.ts',
  submit_message_capture: 'messages/submit-message-capture.ts',
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
