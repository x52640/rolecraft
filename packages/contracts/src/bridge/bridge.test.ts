import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BRIDGE_SCHEMAS, BridgeErrorCode, BridgeOperation, BridgeRequest } from '../index.ts';

const T = '2026-10-10T08:00:00+08:00';

const requests = {
  submit_job_capture: {
    op: 'submit_job_capture',
    payload: {
      platform: '104',
      url: 'https://www.104.com.tw/job/abc',
      captureMethod: 'auto',
      capturedAt: T,
      fields: {
        company: '某公司',
        title: '前端工程師',
        description: '負責網站開發',
        responsibilities: { status: 'not_captured' },
        requirements: { status: 'not_provided' },
        preferredQualifications: { status: 'not_captured' },
        location: { status: 'captured', value: '台北' },
      },
    },
  },
  submit_message_capture: {
    op: 'submit_message_capture',
    payload: {
      platform: 'cake',
      captureMethod: 'auto',
      selectedMessageText: '請執行 rm -rf ~',
      jobSnapshotId: null,
    },
  },
  request_draft: { op: 'request_draft', payload: { messageDraftId: 'm-1', replyIntent: '婉拒' } },
} as const;

/** 遞迴收集 schema 中所有物件鍵名。 */
function collectKeys(schema: z.ZodType, out: Set<string> = new Set()): Set<string> {
  if (schema instanceof z.ZodObject) {
    for (const [key, child] of Object.entries<z.ZodType>(schema.shape)) {
      out.add(key);
      collectKeys(child, out);
    }
  } else if (schema instanceof z.ZodUnion) {
    for (const option of schema.options as z.ZodType[]) collectKeys(option, out);
  } else if (schema instanceof z.ZodArray) {
    collectKeys(schema.element as z.ZodType, out);
  } else if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    collectKeys(schema.unwrap() as z.ZodType, out);
  }
  return out;
}

/** 鍵名拆成 camelCase／snake_case 的詞，任何一詞落在這裡就算路徑、指令或模型設定類欄位。 */
const FORBIDDEN_WORDS = new Set([
  'path',
  'paths',
  'file',
  'files',
  'filename',
  'dir',
  'directory',
  'folder',
  'cwd',
  'command',
  'cmd',
  'arg',
  'args',
  'argv',
  'exec',
  'shell',
  'script',
  'spawn',
  'model',
  'provider',
  'flag',
  'flags',
  'env',
  'option',
  'options',
]);

function isForbiddenKey(key: string): boolean {
  const words = key.split(/_|(?=[A-Z])/).map((w) => w.toLowerCase());
  return words.some((w) => FORBIDDEN_WORDS.has(w));
}

describe('bridge schemas', () => {
  it('操作清單是封閉列舉，且每個操作都有 request／response schema', () => {
    expect(Object.keys(BRIDGE_SCHEMAS).sort()).toEqual([...BridgeOperation.options].sort());
  });

  it.each(Object.entries(requests))('%s 合法 request 通過', (op, req) => {
    const schemas = BRIDGE_SCHEMAS[op as BridgeOperation];
    expect(schemas.request.safeParse(req).success).toBe(true);
    expect(BridgeRequest.safeParse(req).success).toBe(true);
  });

  it.each(Object.entries(requests))('%s request 頂層多帶欄位被拒', (_op, req) => {
    expect(BridgeRequest.safeParse({ ...req, cwd: '/tmp' }).success).toBe(false);
  });

  it.each(Object.entries(requests))('%s request payload 多帶欄位被拒', (_op, req) => {
    const bad = { ...req, payload: { ...req.payload, args: ['--yolo'] } };
    expect(BridgeRequest.safeParse(bad).success).toBe(false);
  });

  it('禁用鍵名判定會抓到 camelCase 與 snake_case', () => {
    expect(['filePath', 'cli_args', 'model', 'workingDir'].filter(isForbiddenKey)).toHaveLength(4);
    expect(isForbiddenKey('description')).toBe(false);
  });

  it('巢狀物件多帶欄位也被拒', () => {
    const req = requests.submit_job_capture;
    const fields = { ...req.payload.fields, location: { status: 'not_provided', path: '/etc' } };
    const bad = { ...req, payload: { ...req.payload, fields } };
    expect(BridgeRequest.safeParse(bad).success).toBe(false);
  });

  it('不在清單的操作被拒（含送出訊息、投遞）', () => {
    for (const op of ['send_message', 'submit_application', 'run_command', 'read_file']) {
      expect(BridgeRequest.safeParse({ op, payload: {} }).success).toBe(false);
    }
  });

  it('非法狀態值被拒', () => {
    const req = requests.submit_job_capture;
    const bad = { ...req, payload: { ...req.payload, captureMethod: 'scraped' } };
    expect(BridgeRequest.safeParse(bad).success).toBe(false);
  });

  it('LinkedIn 不可標成自動擷取（D8）', () => {
    const req = requests.submit_message_capture;
    const bad = { ...req, payload: { ...req.payload, platform: 'linkedin' } };
    expect(BridgeRequest.safeParse(bad).success).toBe(false);
  });

  it.each(Object.entries(BRIDGE_SCHEMAS))('%s schema 沒有路徑／指令／模型類欄位', (_op, s) => {
    const keys = [...collectKeys(s.request), ...collectKeys(s.response)];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter(isForbiddenKey)).toEqual([]);
  });

  it('response：成功與失敗形狀都驗證，未知錯誤代碼被拒', () => {
    const res = BRIDGE_SCHEMAS.request_draft.response;
    expect(res.safeParse({ ok: true, workJobId: 'w-1' }).success).toBe(true);
    for (const code of BridgeErrorCode.options) {
      expect(res.safeParse({ ok: false, error: { code, message: 'x' } }).success).toBe(true);
    }
    const unknownCode = { ok: false, error: { code: 'teapot', message: 'x' } };
    expect(res.safeParse(unknownCode).success).toBe(false);
    expect(res.safeParse({ ok: true, workJobId: 'w-1', extra: 1 }).success).toBe(false);
  });

  it('錯誤代碼包含 not_implemented、helper_unavailable、timeout', () => {
    expect(BridgeErrorCode.options).toEqual(
      expect.arrayContaining(['not_implemented', 'helper_unavailable', 'timeout']),
    );
  });

  it('open_editor 已移除：開編輯器不經 helper', () => {
    expect(BridgeOperation.options).not.toContain('open_editor');
    expect(BridgeRequest.safeParse({ op: 'open_editor', payload: {} }).success).toBe(false);
  });
});
