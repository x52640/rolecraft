import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { unknownImport } from './failures.ts';

/**
 * import.confirm：以使用者確認當下的內容寫入 Profile 並標為已確認（R10）；
 * 解析失敗時也可確認手動輸入的內容（D18）。
 */
export const importConfirm: OpHandler<'import.confirm'> = (payload, services) => {
  const service = services.resumeImport;
  if (!service?.confirm) return Promise.resolve(notImplemented());
  const outcome = service.confirm(payload.importId, payload.profile);
  if (outcome.ok) return Promise.resolve({ ok: true, profileId: outcome.profileId });
  if (outcome.reason === 'unknown_import') return Promise.resolve(unknownImport());
  return Promise.resolve({
    ok: false,
    error: { code: 'invalid_request', message: '內容全空，沒有可寫入的個人資料' },
  });
};
