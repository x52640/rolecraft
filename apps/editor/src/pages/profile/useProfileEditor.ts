import type { BridgeFailure } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import {
  baseOf,
  toPayload,
  validate,
  type ProfileBase,
  type ProfileFormState,
} from './profile-model.ts';
import { PROFILE_PAGE_TEXT, failureText } from './profile-text.ts';

/** 頁面讀取結果。 */
export type ProfileView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly base: ProfileBase }
  /** 沒有 Profile：導向匯入頁 */
  | { readonly kind: 'none' }
  /** 不讀不寫（多份 Profile）或讀不到（服務未接上、失敗）；只能重新讀取 */
  | { readonly kind: 'blocked'; readonly message: string };

export type ProfileBusy = 'loading' | 'saving';

const isMultiple = (f: BridgeFailure) =>
  f.error.code === 'invalid_request' && f.error.reason === 'multiple_profiles';

/**
 * 個人資料頁的讀取與儲存（D30）。比照 useIntro／useBlockLock 避免競態：
 * - 任何請求進行中（busy 不為 null）表單與按鈕一律鎖住，一次只允許一個請求；編輯在鎖住時不套用。
 * - 每個操作有 token；回應回來時頁面已卸載或已有更新的操作開始就作廢（含 StrictMode 重跑初次讀取）。
 * - 只有使用者按儲存才送 profile.update，一律帶畫面讀到的版本號；衝突（profile_conflict）時重新讀取、
 *   捨棄未存修改，不自動以新版本號重送（D30 (c)）。請求只有欄位值與來源列，不帶出處文字。
 */
export function useProfileEditor() {
  const bridge = useBridge();
  const [view, setViewState] = useState<ProfileView>({ kind: 'loading' });
  const [form, setFormState] = useState<ProfileFormState | null>(null);
  const [busy, setBusyState] = useState<ProfileBusy | null>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 編輯版本：表單每次改變（輸入、套用讀回內容）加一；畫面上的確認綁這個值，表單一變就失效。 */
  const [editVersion, setEditVersion] = useState(0);
  const busyRef = useRef<ProfileBusy | null>('loading');
  const viewRef = useRef<ProfileView>({ kind: 'loading' });
  const formRef = useRef<ProfileFormState | null>(null);
  const opRef = useRef(0);
  const disposed = useRef(false);

  const setBusy = (next: ProfileBusy | null) => {
    busyRef.current = next;
    setBusyState(next);
  };
  const setForm = (next: ProfileFormState | null) => {
    formRef.current = next;
    setFormState(next);
    setEditVersion((v) => v + 1);
  };
  /** 換成讀回的內容：表單整份換成新基準（未存修改捨棄）。 */
  const apply = (next: ProfileView) => {
    viewRef.current = next;
    setViewState(next);
    setForm(next.kind === 'ready' ? next.base.form : null);
  };
  const current = (token: number) => !disposed.current && opRef.current === token;
  const begin = (kind: ProfileBusy): number | null => {
    if (busyRef.current !== null) return null;
    setBusy(kind);
    setFailure(null);
    setNotice(null);
    return ++opRef.current;
  };
  const end = (token: number) => {
    if (current(token)) setBusy(null);
  };

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      opRef.current += 1;
    };
  }, []);

  /** 讀取 profile.get 換成畫面狀態；一般失敗回 failure（由呼叫端決定是否沿用畫面）。 */
  const fetchView = useCallback(async (): Promise<ProfileView | BridgeFailure> => {
    const res = await bridge.send({ op: 'profile.get', payload: {} });
    if (res.ok)
      return res.profile ? { kind: 'ready', base: baseOf(res.profile) } : { kind: 'none' };
    if (isMultiple(res)) return { kind: 'blocked', message: PROFILE_PAGE_TEXT.multiple };
    return res;
  }, [bridge]);

  /** 讀取並套用；失敗時 keep＝沿用畫面只顯示原因，否則整頁換成讀不到。 */
  const loadInto = async (token: number, keep: boolean): Promise<boolean> => {
    const next = await fetchView();
    if (!current(token)) return false;
    if ('ok' in next) {
      if (keep) setFailure(failureText(next));
      else apply({ kind: 'blocked', message: failureText(next) });
      return false;
    }
    apply(next);
    return true;
  };

  useEffect(() => {
    // 初次讀取強制開始：先前的操作一律作廢（StrictMode 重跑時舊的讀取不套用）
    setBusy('loading');
    setFailure(null);
    const token = ++opRef.current;
    void loadInto(token, false).then(() => end(token));
    return () => {
      opRef.current += 1;
    };
    // 只在掛載（與 bridge 改變）時讀取一次
  }, [fetchView]);

  /** 使用者輸入；請求進行中不套用。 */
  const edit = (next: ProfileFormState) => {
    if (busyRef.current !== null || viewRef.current.kind !== 'ready') return;
    setForm(next);
    // 先前的「已儲存」等提示只對當時的內容成立
    setNotice(null);
  };

  /** 重新讀取（有未存修改時由畫面先確認）；失敗時畫面不變。 */
  async function reload() {
    const token = begin('loading');
    if (token === null) return;
    const ok = await loadInto(token, viewRef.current.kind === 'ready');
    if (ok && current(token)) setNotice(PROFILE_PAGE_TEXT.reloaded);
    end(token);
  }

  /** 按儲存：送畫面讀到的版本號與整份內容；成功以回傳內容更新畫面。 */
  async function save() {
    const shown = viewRef.current;
    const sent = formRef.current;
    if (shown.kind !== 'ready' || sent === null || busyRef.current !== null) return;
    const problem = validate(sent);
    if (problem) {
      setNotice(null);
      setFailure(problem);
      return;
    }
    const token = begin('saving');
    if (token === null) return;
    const payload = toPayload(sent, shown.base.version);
    const res = await bridge.send({ op: 'profile.update', payload });
    if (!current(token)) return;
    if (res.ok) {
      apply({ kind: 'ready', base: baseOf(res.profile) });
      setNotice(PROFILE_PAGE_TEXT.saved);
    } else if (res.error.code === 'invalid_request' && res.error.reason === 'profile_conflict') {
      // D30 (c)：重新讀取最新內容，未存修改直接捨棄、不自動套回、不重送
      await loadInto(token, false);
      if (current(token)) setFailure(PROFILE_PAGE_TEXT.conflict);
    } else if (res.error.code === 'invalid_request' && res.error.reason === 'profile_missing') {
      await loadInto(token, false);
      if (current(token)) setFailure(PROFILE_PAGE_TEXT.missingOnSave);
    } else if (isMultiple(res)) {
      apply({ kind: 'blocked', message: PROFILE_PAGE_TEXT.multiple });
    } else {
      // 其他失敗：顯示原因，畫面（含未存修改）不變，使用者可再按儲存
      setFailure(failureText(res));
    }
    end(token);
  }

  return { view, form, busy, failure, notice, editVersion, edit, reload, save };
}
