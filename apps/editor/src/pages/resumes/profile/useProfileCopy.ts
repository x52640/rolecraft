import type { BridgeResponseOf, Profile } from '@rolecraft/contracts';
import { useState } from 'react';

import { useBridge } from '../../../bridge/BridgeProvider.tsx';
import { PROFILE_TEXT, failureText, findItem } from './profile-labels.ts';
import type { BlockLock } from './useBlockLock.ts';

/** 畫面上的個人資料狀態。 */
export type ProfileState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly profile: Profile }
  | { readonly kind: 'none' }
  /** 沒有可顯示的內容：多份 Profile、服務未接上、讀取失敗 */
  | { readonly kind: 'blocked'; readonly message: string };

type ProfileResponse = BridgeResponseOf<'profile.get'>;

/** profile.get 的回應換成畫面狀態；一般失敗（逾時、連不上）回 null，由呼叫端決定是否沿用畫面。 */
function stateOf(res: ProfileResponse): ProfileState | null {
  if (res.ok) return res.profile ? { kind: 'ready', profile: res.profile } : { kind: 'none' };
  if (res.error.code === 'not_implemented') {
    return { kind: 'blocked', message: PROFILE_TEXT.notImplemented };
  }
  if (res.error.code === 'invalid_request' && res.error.reason === 'multiple_profiles') {
    return { kind: 'blocked', message: PROFILE_TEXT.multiple };
  }
  return null;
}

/**
 * 只比欄位值（基本資料、經歷、技能）；出處原文、版本號等中繼資料不比（D30：只有出處或版本號不同時仍可複製）。
 */
const values = (p: Profile) =>
  JSON.stringify({ personalInfo: p.personalInfo, experiences: p.experiences, skills: p.skills });
const same = (a: Profile, b: Profile) => values(a) === values(b);

/**
 * 已確認個人資料的顯示與逐欄複製（P1-T085；resume-output「內容回填到求職網站」、D28 Q12）。
 * 按下複製時重新 profile.get：讀回的整份 Profile 欄位值與畫面完全一致才把該欄寫入剪貼簿；
 * 不一致就把畫面更新成讀回的內容、請使用者確認後再按一次（不在同一次按下裡複製新值）。
 */
export function useProfileCopy(lock: BlockLock) {
  const bridge = useBridge();
  const [state, setState] = useState<ProfileState>({ kind: 'loading' });
  const [message, setMessage] = useState<string | null>(null);

  const fetchProfile = () => bridge.send({ op: 'profile.get', payload: {} });

  /** 初次讀取或重新讀取的結果套用到畫面。 */
  const apply = (res: ProfileResponse) => {
    const next = stateOf(res);
    if (next) setState(next);
    else if (!res.ok) setState({ kind: 'blocked', message: failureText(res) });
  };

  async function copy(key: string) {
    if (state.kind !== 'ready') return;
    const shown = state.profile;
    const token = lock.begin('copying');
    if (token === null) return;
    setMessage(null);
    try {
      const res = await fetchProfile();
      if (!lock.current(token)) return;
      const next = stateOf(res);
      if (!res.ok && next === null) {
        // 逾時、連不上等：不知道實際內容，畫面不動、不複製
        setMessage(failureText(res));
        return;
      }
      if (!res.ok || !res.profile) {
        setState(next ?? { kind: 'none' });
        setMessage(PROFILE_TEXT.removed);
        return;
      }
      const fresh = res.profile;
      if (!same(fresh, shown)) {
        setState({ kind: 'ready', profile: fresh });
        setMessage(PROFILE_TEXT.changed);
        return;
      }
      const item = findItem(fresh, key);
      if (!item) return;
      if (item.value === '') {
        setMessage(PROFILE_TEXT.empty);
        return;
      }
      try {
        await navigator.clipboard.writeText(item.value);
        if (lock.current(token)) setMessage(PROFILE_TEXT.done(item.label));
      } catch {
        if (lock.current(token)) setMessage(PROFILE_TEXT.clipboard);
      }
    } finally {
      lock.end(token);
    }
  }

  return { state, message, fetchProfile, apply, copy };
}
