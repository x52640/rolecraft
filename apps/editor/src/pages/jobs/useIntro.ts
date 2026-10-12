import type { ApplicationIntro, IntroCheckView, IntroGenerationView } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { INTRO_PROBLEM_LABELS, generationFailureText, introFailureText } from './intro-labels.ts';

export interface IntroPollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍在產生就停止並提示 */
  readonly maxPolls: number;
}

export const DEFAULT_INTRO_POLL: IntroPollOptions = { intervalMs: 3000, maxPolls: 60 };

/** 產生中途 helper 重開（狀態只在記憶體），輪詢拿到 null。 */
export const INTERRUPTED_TEXT =
  '產生中斷：本機輔助程式可能重新啟動，沒有拿到結果。請再按一次產生。';

/** 進行中的 helper 請求；一次只允許一個，進行中鎖住編輯框與所有按鈕。 */
export type IntroBusy = 'loading' | 'generating' | 'saving' | 'copying' | 'reloading';

interface Loaded {
  readonly intro: ApplicationIntro | null;
  readonly check: IntroCheckView | null;
  readonly generation: IntroGenerationView | null;
}

/**
 * 單一職缺快照的投遞自介：讀取、要求產生（輪詢最近一次產生狀態）、編輯、儲存（helper 重跑檢查）、
 * 複製前重檢、重新載入。結構上避免競態（codex 第三輪）：
 * - 任何對 helper 的請求進行中（busy 不為 null），編輯框與按鈕一律鎖住，一次只允許一個請求。
 * - 單一編輯版本號：編輯框內容每次改變（使用者輸入、套用 helper 的內容、儲存成功）都加一；
 *   請求送出時記下版本號，回來時版本號已變就作廢，不套用、不複製。
 * 沒有任何送出（D7）：自介只存在本機，由使用者複製後自行貼到求職網站。
 */
export function useIntro(jobSnapshotId: string, poll: IntroPollOptions) {
  const bridge = useBridge();
  const [intro, setIntro] = useState<ApplicationIntro | null>(null);
  const [check, setCheck] = useState<IntroCheckView | null>(null);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusyState] = useState<IntroBusy | null>('loading');
  const [version, setVersionState] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const busyRef = useRef<IntroBusy | null>('loading');
  const versionRef = useRef(0);
  /** 目前操作的 token：只有目前操作的後續步驟能套用結果、解鎖（舊操作、舊輪詢一律作廢） */
  const opRef = useRef(0);

  const setBusy = (next: IntroBusy | null) => {
    busyRef.current = next;
    setBusyState(next);
  };
  const bump = () => {
    versionRef.current += 1;
    setVersionState(versionRef.current);
  };
  /** 開始一個請求，回傳它的 token；已有請求進行中就不開始（回 null）。 */
  const begin = (kind: IntroBusy): number | null => {
    if (busyRef.current !== null) return null;
    setBusy(kind);
    setNotice(null);
    setFailure(null);
    return ++opRef.current;
  };
  const current = (token: number) => !disposed.current && opRef.current === token;
  /** 只有目前操作能解鎖。 */
  const end = (token: number) => {
    if (current(token)) setBusy(null);
  };

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** 讀取（不套用）；失敗回 undefined 並顯示原因。 */
  const fetchIntro = useCallback(async (): Promise<Loaded | undefined> => {
    const response = await bridge.send({ op: 'intro.get', payload: { jobSnapshotId } });
    if (disposed.current) return undefined;
    if (!response.ok) {
      setFailure(introFailureText(response));
      return undefined;
    }
    return response;
  }, [bridge, jobSnapshotId]);

  /** 套用 helper 的已儲存內容到編輯框（新版本）。 */
  const applyLoaded = (loaded: Loaded) => {
    setIntro(loaded.intro);
    setCheck(loaded.check);
    setText(loaded.intro?.text ?? '');
    setDirty(false);
    bump();
  };

  const showFailure = (generation: IntroGenerationView | null) => {
    if (generation?.state === 'failed' && generation.failure) {
      setFailure(generationFailureText(generation.failure, generation.problem));
    }
  };

  const waitForResult = (remaining: number, sentAt: number, token: number) => {
    timer.current = setTimeout(() => {
      void fetchIntro().then((loaded) => {
        if (!current(token)) return;
        const { generation } = loaded ?? { generation: undefined };
        if (loaded && generation?.state === 'running' && remaining > 1) {
          waitForResult(remaining - 1, sentAt, token);
          return;
        }
        if (loaded && versionRef.current === sentAt) {
          if (generation?.state === 'running') {
            setFailure('還在產生中：可以先離開，稍後重新開啟這個職缺查看。');
          } else if (generation === null) {
            setFailure(INTERRUPTED_TEXT);
          } else if (generation?.state === 'succeeded') {
            applyLoaded(loaded);
            setNotice('已產生投遞自介。請檢查、對照引用後再複製。');
          } else {
            showFailure(generation ?? null);
          }
        }
        end(token);
      });
    }, poll.intervalMs);
  };

  useEffect(() => {
    // 初次讀取也是一個操作；cleanup（含 StrictMode 的重跑）讓它與其輪詢作廢
    const token = ++opRef.current;
    setBusy('loading');
    void fetchIntro().then((loaded) => {
      if (!current(token)) return;
      if (!loaded) {
        end(token);
        return;
      }
      applyLoaded(loaded);
      if (loaded.generation?.state === 'running') {
        setBusy('generating');
        waitForResult(poll.maxPolls, versionRef.current, token);
        return;
      }
      // 離開期間已結束的失敗也要顯示原因
      showFailure(loaded.generation);
      end(token);
    });
    return () => {
      opRef.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // 只在切換職缺（fetchIntro 改變）時讀取一次
  }, [fetchIntro]);

  async function generate() {
    const token = begin('generating');
    if (token === null) return;
    const sentAt = versionRef.current;
    const response = await bridge.send({ op: 'intro.generate', payload: { jobSnapshotId } });
    if (!current(token)) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
      end(token);
      return;
    }
    waitForResult(poll.maxPolls, sentAt, token);
  }

  async function save() {
    const token = begin('saving');
    if (token === null) return;
    const sentAt = versionRef.current;
    const response = await bridge.send({ op: 'intro.update', payload: { jobSnapshotId, text } });
    if (!current(token)) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
    } else if (versionRef.current === sentAt) {
      setIntro(response.intro);
      setCheck(response.check);
      setDirty(false);
      bump(); // 儲存成功也是新版本：先前的確認（例如重新載入的警告）失效
      setNotice('已儲存（只存在本機，不會送出），並重新檢查。');
    }
    end(token);
  }

  /** 重新載入已儲存的內容（放棄未儲存的修改；有未存修改時由畫面先確認）。 */
  async function reload() {
    const token = begin('reloading');
    if (token === null) return;
    const sentAt = versionRef.current;
    const loaded = await fetchIntro();
    if (!current(token)) return;
    if (loaded && versionRef.current === sentAt) {
      applyLoaded(loaded);
      setNotice('已重新載入已儲存的內容。');
    }
    end(token);
  }

  /** 複製前重新讀取並重跑檢查；通過、版本沒變且已儲存內容與編輯框一致才寫入剪貼簿。 */
  async function copy() {
    const token = begin('copying');
    if (token === null) return;
    const sentAt = versionRef.current;
    const shown = text;
    try {
      const loaded = await fetchIntro();
      if (!current(token) || !loaded || versionRef.current !== sentAt) return;
      const fresh = loaded.intro;
      if (!fresh || !loaded.check) {
        setFailure('找不到已儲存的自介：請重新產生。');
        return;
      }
      if (dirty) {
        setFailure('有尚未儲存的修改：儲存後會重新檢查，通過才能複製。');
        return;
      }
      if (fresh.text !== shown) {
        // 已儲存的內容在別處變了（另一頁編輯、逾時後才產生完成）；沒有未存修改就同步成新內容
        applyLoaded(loaded);
        setNotice('已儲存的自介在別處有變更，已更新為最新內容：請確認後再按一次複製。');
        return;
      }
      setCheck(loaded.check);
      // 文字相同也用回應更新中繼資料（例如別處儲存過而變成「經使用者編輯」）；有變就讓先前的確認失效
      if (JSON.stringify(fresh) !== JSON.stringify(intro)) {
        setIntro(fresh);
        bump();
      }
      if (loaded.check.problem) {
        setFailure(`重新檢查沒有通過，不能複製：${INTRO_PROBLEM_LABELS[loaded.check.problem]}。`);
        return;
      }
      try {
        await navigator.clipboard.writeText(fresh.text);
        setNotice('已複製。請到求職網站貼上，並由你自己送出。');
      } catch {
        setFailure('無法複製到剪貼簿：請手動選取文字複製。');
      }
    } finally {
      end(token);
    }
  }

  return {
    intro,
    check,
    text,
    setText: (next: string) => {
      if (busyRef.current !== null) return; // 請求進行中鎖住編輯
      setText(next);
      setDirty(true);
      bump();
    },
    dirty,
    busy,
    generating: busy === 'generating',
    version,
    failure,
    notice,
    generate,
    save,
    copy,
    reload,
  };
}
