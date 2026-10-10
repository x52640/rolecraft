// 測試用：在記憶體裡模擬 helper 的 jobs.* 與 submit_job_capture（語意同 helper storage-service）。
import type { BridgeFailure, JobSnapshot } from '@rolecraft/contracts';

import type { BridgeTransport } from '../../bridge/transport.ts';

export const T_CONFIRM = '2026-10-11T01:02:03.000Z';

export const sampleSnapshot = (over: Partial<JobSnapshot> = {}): JobSnapshot => ({
  id: 'job-1',
  platform: '104',
  url: 'https://www.104.com.tw/job/abc',
  capturedAt: '2026-10-10T08:00:00.000Z',
  captureMethod: 'auto',
  fields: {
    company: '某公司',
    title: '前端工程師',
    description: '負責網站開發',
    responsibilities: { status: 'captured', value: '維護元件庫' },
    requirements: { status: 'not_captured' },
    preferredQualifications: { status: 'not_provided' },
    location: { status: 'captured', value: '台北' },
  },
  userModified: false,
  confirmedAt: null,
  ...over,
});

interface Req {
  op: string;
  payload: Record<string, unknown>;
}

export interface FakeBridge {
  transport: BridgeTransport;
  snapshots: JobSnapshot[];
  requests: Req[];
  /** 之後的請求一律回這個失敗。 */
  failWith: BridgeFailure | null;
}

const NOT_FOUND: BridgeFailure = {
  ok: false,
  error: { code: 'invalid_request', message: '找不到這個職缺快照' },
};

export function fakeBridge(initial: JobSnapshot[] = []): FakeBridge {
  const fake: FakeBridge = {
    snapshots: [...initial],
    requests: [],
    failWith: null,
    transport: { send: (request) => Promise.resolve(handle(request as Req)) },
  };
  const find = (id: unknown) => fake.snapshots.find((s) => s.id === id);
  const replace = (next: JobSnapshot) => {
    fake.snapshots = fake.snapshots.map((s) => (s.id === next.id ? next : s));
  };

  function handle(req: Req): unknown {
    fake.requests.push(req);
    if (fake.failWith) return fake.failWith;
    const current = find(req.payload.jobSnapshotId);
    switch (req.op) {
      case 'jobs.list':
        return {
          ok: true,
          snapshots: fake.snapshots.map((s) => ({
            id: s.id,
            platform: s.platform,
            captureMethod: s.captureMethod,
            company: s.fields.company,
            title: s.fields.title,
            capturedAt: s.capturedAt,
            userModified: s.userModified,
            confirmedAt: s.confirmedAt,
          })),
        };
      case 'jobs.get':
        return current ? { ok: true, snapshot: current } : NOT_FOUND;
      case 'jobs.update': {
        if (!current) return NOT_FOUND;
        const fields = req.payload.fields as JobSnapshot['fields'];
        replace({ ...current, fields, userModified: true, confirmedAt: null });
        return { ok: true };
      }
      case 'jobs.confirm':
        if (!current) return NOT_FOUND;
        replace({ ...current, confirmedAt: T_CONFIRM });
        return { ok: true };
      case 'submit_job_capture': {
        const p = req.payload as Omit<JobSnapshot, 'id' | 'userModified' | 'confirmedAt'>;
        const id = `job-${String(fake.snapshots.length + 1)}`;
        fake.snapshots.push({ ...p, id, userModified: false, confirmedAt: null });
        return { ok: true, jobSnapshotId: id };
      }
      default:
        return { ok: false, error: { code: 'not_implemented', message: '此操作尚未支援' } };
    }
  }
  return fake;
}
