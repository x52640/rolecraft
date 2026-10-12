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

interface Loaded {
  readonly intro: ApplicationIntro | null;
  readonly check: IntroCheckView | null;
  readonly generation: IntroGenerationView | null;
}

/**
 * 單一職缺快照的投遞自介：讀取、要求產生（輪詢最近一次產生狀態）、編輯、儲存（helper 重跑檢查）、複製。
 * 複製前一律向 helper 重新讀取並重跑檢查（期間事實項或來源可能變了）。
 * 沒有任何送出（D7）：自介只存在本機，由使用者複製後自行貼到求職網站。
 */
export function useIntro(jobSnapshotId: string, poll: IntroPollOptions) {
  const bridge = useBridge();
  const [intro, setIntro] = useState<ApplicationIntro | null>(null);
  const [check, setCheck] = useState<IntroCheckView | null>(null);
  const [text, setText] = useState('');
  const [dirty, setDirtyState] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const latestText = useRef('');
  /** 儲存請求序號：只採用最新一次儲存的回應（亂序回來的舊回應丟棄） */
  const saveSeq = useRef(0);

  /** 有沒有未儲存修改（await 之後要看最新值，所以另存一份 ref） */
  const dirtyRef = useRef(false);
  const setDirty = (next: boolean) => {
    dirtyRef.current = next;
    setDirtyState(next);
  };

  const applyText = (next: string) => {
    latestText.current = next;
    setText(next);
  };

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** 讀取並套用自介與檢查；讀取失敗回 undefined。 */
  const load = useCallback(async (): Promise<Loaded | undefined> => {
    const response = await bridge.send({ op: 'intro.get', payload: { jobSnapshotId } });
    if (disposed.current) return undefined;
    if (!response.ok) {
      setFailure(introFailureText(response));
      return undefined;
    }
    setIntro(response.intro);
    setCheck(response.check);
    return response;
  }, [bridge, jobSnapshotId]);

  const replaceText = (loaded: Loaded) => {
    applyText(loaded.intro?.text ?? '');
    setDirty(false);
  };

  const showFailure = (generation: IntroGenerationView | null) => {
    if (generation?.state === 'failed' && generation.failure) {
      setFailure(generationFailureText(generation.failure, generation.problem));
    }
  };

  const waitForResult = (remaining: number) => {
    timer.current = setTimeout(() => {
      void load().then((loaded) => {
        if (disposed.current) return;
        if (loaded === undefined) {
          setGenerating(false);
          return;
        }
        const { generation } = loaded;
        if (generation?.state === 'running') {
          if (remaining > 1) {
            waitForResult(remaining - 1);
            return;
          }
          setFailure('還在產生中：可以先離開，稍後重新開啟這個職缺查看。');
        } else if (generation === null) {
          setFailure(INTERRUPTED_TEXT);
        } else if (generation.state === 'succeeded') {
          // 同一次回應套用新文字後才解鎖編輯框，期間不會有輸入被蓋掉
          replaceText(loaded);
          setNotice('已產生投遞自介。請檢查、對照引用後再複製。');
        } else {
          showFailure(generation);
        }
        setGenerating(false);
      });
    }, poll.intervalMs);
  };

  useEffect(() => {
    void load().then((loaded) => {
      if (!loaded) return;
      replaceText(loaded);
      if (loaded.generation?.state === 'running') {
        setGenerating(true);
        waitForResult(poll.maxPolls);
      } else {
        // 離開期間已結束的失敗也要顯示原因
        showFailure(loaded.generation);
      }
    });
    // 只在切換職缺（load 改變）時讀取一次
  }, [load]);

  async function generate() {
    setNotice(null);
    setFailure(null);
    if (timer.current) clearTimeout(timer.current);
    const response = await bridge.send({ op: 'intro.generate', payload: { jobSnapshotId } });
    if (disposed.current) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
      return;
    }
    setGenerating(true);
    waitForResult(poll.maxPolls);
  }

  async function save() {
    setNotice(null);
    setFailure(null);
    const submitted = text;
    const seq = ++saveSeq.current;
    setSaving(true);
    try {
      const response = await bridge.send({
        op: 'intro.update',
        payload: { jobSnapshotId, text: submitted },
      });
      if (disposed.current || seq !== saveSeq.current) return;
      if (!response.ok) {
        setFailure(introFailureText(response));
        return;
      }
      setIntro(response.intro);
      setCheck(response.check);
      if (latestText.current === submitted) setDirty(false);
      setNotice('已儲存（只存在本機，不會送出），並重新檢查。');
    } finally {
      if (seq === saveSeq.current) setSaving(false);
    }
  }

  /** 重新載入已儲存的內容（放棄未儲存的修改；有未存修改時由畫面先確認）。 */
  async function reload() {
    setNotice(null);
    setFailure(null);
    const loaded = await load();
    if (disposed.current || loaded === undefined) return;
    replaceText(loaded);
    setNotice('已重新載入已儲存的內容。');
  }

  /**
   * 複製前重新讀取並重跑檢查；通過且已儲存內容與「目前」編輯框一致才寫入剪貼簿
   * （比對用 await 之後的編輯框內容：重檢期間使用者可能又改了）。
   */
  async function copy() {
    setNotice(null);
    setFailure(null);
    const loaded = await load();
    if (disposed.current || loaded === undefined) return;
    const fresh = loaded.intro;
    if (!fresh || !loaded.check) {
      setFailure('找不到已儲存的自介：請重新產生。');
      return;
    }
    if (dirtyRef.current) {
      setFailure('有尚未儲存的修改：儲存後會重新檢查，通過才能複製。');
      return;
    }
    if (fresh.text !== latestText.current) {
      // 已儲存的內容在別處變了（另一頁編輯、逾時後才產生完成）；沒有未存修改就同步成新內容
      replaceText(loaded);
      setNotice('已儲存的自介在別處有變更，已更新為最新內容：請確認後再按一次複製。');
      return;
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
  }

  return {
    intro,
    check,
    text,
    setText: (next: string) => {
      applyText(next);
      setDirty(true);
    },
    dirty,
    generating,
    saving,
    failure,
    notice,
    generate,
    save,
    copy,
    reload,
  };
}
