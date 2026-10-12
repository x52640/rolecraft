// 測試用：在記憶體裡模擬 helper 的 profile.get 與 photo.*（資料一律合成、去識別化）。
import type { PhotoView, Profile } from '@rolecraft/contracts';

import type { BridgeTransport } from '../../../bridge/transport.ts';

export const sampleProfile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p-1',
  personalInfo: { 姓名: '王小明', Email: 'xiaoming@example.test' },
  experiences: [
    {
      company: '甲公司',
      title: '前端工程師',
      startDate: '2022-03',
      endDate: null,
      description: '負責報表模組改版',
    },
  ],
  skills: ['TypeScript', 'React'],
  pdfParseConfirmed: true,
  ...over,
});

export const samplePhoto = (id = 'ph-1'): PhotoView => ({
  photo: { id, format: 'jpeg', width: 300, height: 400, sha256: 'a'.repeat(64) },
  thumbnail: { mimeType: 'image/jpeg', base64: 'AAAA' },
});

type Reply = unknown;

export interface FakeHelper {
  /** profile.get 依序回的值（用完後重複最後一個） */
  profileReplies: Reply[];
  /** 目前照片（photo.get 讀這個） */
  photo: PhotoView | null;
  /** photo.pick 回的值；selected 時同時把 photo 換成新照片 */
  pickReply: Reply;
  /** photo.remove 回的值；ok 時清掉 photo */
  removeReply: Reply;
  /** photo.get 失敗時回這個（null＝正常） */
  photoGetFailure: Reply;
  /** 設定後，這個操作要等 release 才回 */
  hold: string | null;
  release: () => void;
  ops: string[];
  transport: BridgeTransport;
}

export const ok = { ok: true };
export const fail = (code: string, reason?: string) => ({
  ok: false,
  error: { code, message: `合成錯誤：${code}`, ...(reason ? { reason } : {}) },
});

export function fakeHelper(init: Partial<FakeHelper> = {}): FakeHelper {
  const waiting: (() => void)[] = [];
  const fake: FakeHelper = {
    profileReplies: [{ ok: true, profile: sampleProfile() }],
    photo: null,
    pickReply: { ok: true, selection: { status: 'cancelled' } },
    removeReply: ok,
    photoGetFailure: null,
    hold: null,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
    ops: [],
    transport: { send: () => Promise.resolve(undefined) },
    ...init,
  };
  const answer = (op: string): Reply => {
    switch (op) {
      case 'profile.get':
        return fake.profileReplies.length > 1
          ? fake.profileReplies.shift()
          : fake.profileReplies[0];
      case 'photo.get':
        return fake.photoGetFailure ?? { ok: true, current: fake.photo };
      case 'photo.pick': {
        const reply = fake.pickReply as { ok: boolean; selection?: { status: string } };
        if (reply.ok && reply.selection?.status === 'selected') {
          const { photo, thumbnail } = reply.selection as unknown as PhotoView;
          fake.photo = { photo, thumbnail };
        }
        return reply;
      }
      case 'photo.remove':
        if ((fake.removeReply as { ok: boolean }).ok) fake.photo = null;
        return fake.removeReply;
      default:
        return fail('internal_error');
    }
  };
  fake.transport = {
    send(raw) {
      const { op } = raw as { op: string };
      fake.ops.push(op);
      if (fake.hold !== op) return Promise.resolve(answer(op));
      return new Promise((resolve) => {
        waiting.push(() => resolve(answer(op)));
      });
    },
  };
  return fake;
}
