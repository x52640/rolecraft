import { useCallback, useEffect, useRef, useState } from 'react';

/** 區塊目前在做什麼；null＝閒置。 */
export type BlockBusy = 'loading' | 'copying' | 'picking' | 'removing';

/**
 * 「個人資料與照片」區塊共用的請求鎖（P1-T085；比照 useIntro）：
 * - 任何對 helper 的請求進行中，整個區塊的按鈕一律鎖住，一次只允許一個操作。
 * - 每個操作有 token；回應回來時區塊已卸載或已有更新的操作開始，就作廢（不套用、不複製、不解鎖）。
 */
export function useBlockLock() {
  const [busy, setBusyState] = useState<BlockBusy | null>(null);
  const busyRef = useRef<BlockBusy | null>(null);
  const opRef = useRef(0);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      opRef.current += 1;
    };
  }, []);

  const setBusy = (next: BlockBusy | null) => {
    busyRef.current = next;
    setBusyState(next);
  };

  /** 開始一個操作，回傳 token；已有操作進行中就不開始（回 null）。 */
  const begin = useCallback((kind: BlockBusy): number | null => {
    if (busyRef.current !== null) return null;
    setBusy(kind);
    return ++opRef.current;
  }, []);
  /** 強制開始新操作（初次讀取用）：先前的操作一律作廢。 */
  const restart = useCallback((kind: BlockBusy): number => {
    setBusy(kind);
    return ++opRef.current;
  }, []);
  const current = useCallback((token: number) => !disposed.current && opRef.current === token, []);
  /** 只有目前的操作能解鎖。 */
  const end = useCallback(
    (token: number) => {
      if (current(token)) setBusy(null);
    },
    [current],
  );

  return { busy, begin, restart, current, end };
}

export type BlockLock = ReturnType<typeof useBlockLock>;
