import type { BridgeFailure, BridgeResponseOf, PhotoView } from '@rolecraft/contracts';
import { useState } from 'react';

import { useBridge } from '../../../bridge/BridgeProvider.tsx';
import { PHOTO_TEXT, failureText } from './profile-labels.ts';
import type { BlockLock } from './useBlockLock.ts';

/** 畫面上的照片狀態。 */
export type PhotoState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly current: PhotoView | null }
  /** helper 的照片服務尚未接上（not_implemented） */
  | { readonly kind: 'unsupported' }
  /** 讀不到實際狀態（逾時、連不上等）：不讓使用者在不明狀態下操作 */
  | { readonly kind: 'unknown'; readonly message: string };

type PhotoGetResponse = BridgeResponseOf<'photo.get'>;

export function photoStateOf(res: PhotoGetResponse): PhotoState {
  if (res.ok) return { kind: 'ready', current: res.current };
  if (res.error.code === 'not_implemented') return { kind: 'unsupported' };
  return { kind: 'unknown', message: failureText(res) };
}

const failedText = (what: string, res: BridgeFailure) =>
  res.error.code === 'not_implemented'
    ? PHOTO_TEXT.notImplemented
    : `${what}沒有完成：${failureText(res)}`;

/**
 * 匯出用照片的顯示、加入、更換、刪除（P1-T085；resume-output「照片」、D19、W19）。
 * - 更換與刪除的確認由畫面負責（先說明 D19 後果）；這裡只在確認後送出。
 * - 「加入」送出前先重讀 photo.get：本機其實已有照片（例如在別處加入）就不開選取器，
 *   改為更新畫面，避免沒經過更換確認就換掉舊照片。
 * - photo.* 失敗、逾時、取消或選取視窗忙碌後，一律重新 photo.get，以實際狀態顯示
 *   （客戶端逾時不會取消 helper 的工作）。
 */
export function usePhoto(lock: BlockLock) {
  const bridge = useBridge();
  const [state, setState] = useState<PhotoState>({ kind: 'loading' });
  const [message, setMessage] = useState<string | null>(null);

  const fetchPhoto = () => bridge.send({ op: 'photo.get', payload: {} });
  const apply = (res: PhotoGetResponse) => setState(photoStateOf(res));

  /** 以 photo.get 的實際狀態更新畫面，並附上這次操作的說明。 */
  async function settle(token: number, note: string) {
    const res = await fetchPhoto();
    if (!lock.current(token)) return;
    apply(res);
    setMessage(`${note} ${PHOTO_TEXT.refreshed}`);
  }

  async function run(kind: 'picking' | 'removing', body: (token: number) => Promise<void>) {
    const token = lock.begin(kind);
    if (token === null) return;
    setMessage(null);
    try {
      await body(token);
    } finally {
      lock.end(token);
    }
  }

  async function pick(token: number, replacing: boolean) {
    const res = await bridge.send({ op: 'photo.pick', payload: {} });
    if (!lock.current(token)) return;
    if (res.ok && res.selection.status === 'selected') {
      const { photo, thumbnail } = res.selection;
      setState({ kind: 'ready', current: { photo, thumbnail } });
      setMessage(replacing ? PHOTO_TEXT.replaced : PHOTO_TEXT.added);
      return;
    }
    if (res.ok) {
      const note = res.selection.status === 'busy' ? PHOTO_TEXT.pickerBusy : PHOTO_TEXT.cancelled;
      await settle(token, note);
      return;
    }
    await settle(token, failedText(replacing ? '更換照片' : '加入照片', res));
  }

  /** 加入（畫面上沒有照片時）。 */
  const add = () =>
    run('picking', async (token) => {
      const before = await fetchPhoto();
      if (!lock.current(token)) return;
      if (!before.ok || before.current !== null) {
        apply(before);
        setMessage(before.ok ? PHOTO_TEXT.appeared : failedText('讀取照片', before));
        return;
      }
      await pick(token, false);
    });

  /** 更換（使用者已確認 D19 後果）。 */
  const replace = () => run('picking', (token) => pick(token, true));

  /** 刪除（使用者已確認 D19 後果）。 */
  const remove = () =>
    run('removing', async (token) => {
      const res = await bridge.send({ op: 'photo.remove', payload: {} });
      if (!lock.current(token)) return;
      if (res.ok) {
        setState({ kind: 'ready', current: null });
        setMessage(PHOTO_TEXT.removed);
        return;
      }
      await settle(token, failedText('刪除照片', res));
    });

  return { state, message, fetchPhoto, apply, add, replace, remove };
}
