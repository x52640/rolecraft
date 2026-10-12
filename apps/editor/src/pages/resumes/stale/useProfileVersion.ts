import { profileVersionOf } from '@rolecraft/contracts';
import { useEffect, useState } from 'react';

import { useBridge } from '../../../bridge/BridgeProvider.tsx';

/**
 * 目前已確認 Profile 的版本號（D30 (a)）：每當 trigger 換了（開啟、切換、重新整理版本後
 * 畫面重新讀取）就重讀一次 profile.get；不自動輪詢。
 * 讀取中、失敗、沒有 Profile、多份 Profile 一律回 null（無從比對），不報錯。
 * trigger 換掉或卸載後，舊的回應作廢，不會套到新的畫面。
 */
export function useProfileVersion(trigger: unknown): number | null {
  const bridge = useBridge();
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setCurrent(null);
    bridge
      .send({ op: 'profile.get', payload: {} })
      .then((res) => {
        if (!live) return;
        setCurrent(res.ok && res.profile ? profileVersionOf(res.profile) : null);
      })
      .catch(() => {
        // 讀不到就不顯示提示，也不影響其他操作
      });
    return () => {
      live = false;
    };
  }, [bridge, trigger]);

  return current;
}
