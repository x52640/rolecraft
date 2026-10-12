import type { ImportLatestCapture } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';

export type LatestCaptureState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'found'; readonly capture: ImportLatestCapture }
  /** 查不到（helper 沒開等）：只在擷取區塊提示，不打斷核對或手動輸入 */
  | { readonly kind: 'unavailable' };

/**
 * 最近一次網頁擷取（D28、Q3；`import.latest_capture`）。開頁時查一次，使用者按「重新查詢」再查。
 * 只是查詢：不開啟、不改變正在核對的內容，也不觸發 AI 整理（Q4＝B）。舊的查詢晚到不覆蓋新的。
 */
export function useLatestCapture() {
  const bridge = useBridge();
  const [state, setState] = useState<LatestCaptureState>({ kind: 'loading' });
  const opRef = useRef(0);

  const refresh = () => {
    opRef.current += 1;
    const token = opRef.current;
    setState({ kind: 'loading' });
    void bridge.send({ op: 'import.latest_capture', payload: {} }).then((response) => {
      if (opRef.current !== token) return;
      if (!response.ok) setState({ kind: 'unavailable' });
      else if (response.capture === null) setState({ kind: 'none' });
      else setState({ kind: 'found', capture: response.capture });
    });
  };

  useEffect(() => {
    refresh();
    return () => {
      opRef.current += 1;
    };
  }, []);

  return { state, refresh };
}
