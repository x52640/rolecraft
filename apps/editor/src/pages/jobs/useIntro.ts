import type {
  ApplicationIntro,
  BridgeResponseOf,
  IntroCheckView,
  IntroDraft,
} from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import {
  INTERRUPTED_TEXT,
  INTRO_PROBLEM_LABELS,
  generationFailureOf,
  introFailureText,
  type IntroBusy,
  type IntroPollOptions,
} from './intro-labels.ts';

/** 一個編輯框：內容與是否有未儲存的修改。 */
type Box = { readonly text: string; readonly dirty: boolean };
const clean = (text = ''): Box => ({ text, dirty: false });

type Loaded = Extract<BridgeResponseOf<'intro.get'>, { ok: true }>;

/**
 * 單一職缺快照的投遞自介：讀取、要求產生（輪詢最近一次產生狀態）、編輯、儲存（helper 重跑檢查）、
 * 複製前重檢、重新載入。結構上避免競態（codex 第三輪）：
 * - 任何對 helper 的請求進行中（busy 不為 null），編輯框與按鈕一律鎖住，一次只允許一個請求。
 * - 單一編輯版本號：編輯框內容每次改變（使用者輸入、套用 helper 的內容、儲存成功）都加一；
 *   請求送出時記下版本號，回來時版本號已變就作廢，不套用、不複製。
 * 未通過檢查的草稿（P1-T071）另有自己的編輯框（draftText），同樣受上述鎖定與版本號保護；草稿不能複製，
 * 儲存通過檢查才成為正式自介，「請 AI 修正」＝帶 fix 的產生。
 * 沒有任何送出（D7）：自介只存在本機，由使用者複製後自行貼到求職網站。
 */
export function useIntro(jobSnapshotId: string, poll: IntroPollOptions) {
  const bridge = useBridge();
  const [intro, setIntro] = useState<ApplicationIntro | null>(null);
  const [check, setCheck] = useState<IntroCheckView | null>(null);
  const [box, setBox] = useState(clean());
  const [draft, setDraft] = useState<IntroDraft | null>(null);
  const [draftBox, setDraftBox] = useState(clean());
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
  const bump = () => setVersionState(++versionRef.current);
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

  /** 套用 helper 的已存自介到編輯框（呼叫端負責 bump）。 */
  const applyIntro = (next: ApplicationIntro | null, nextCheck: IntroCheckView | null) => {
    setIntro(next);
    setCheck(nextCheck);
    setBox(clean(next?.text));
  };
  /** 套用 helper 的未通過草稿到草稿編輯框（呼叫端負責 bump）。 */
  const applyDraft = (next: IntroDraft | null) => {
    setDraft(next);
    setDraftBox(clean(next?.text));
  };
  /** 套用 helper 的已儲存內容（自介與草稿）到編輯框（新版本）。 */
  const applyLoaded = (loaded: Loaded) => {
    applyIntro(loaded.intro, loaded.check);
    applyDraft(loaded.draft ?? null);
    bump();
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
            setFailure((prev) => generationFailureOf(generation) ?? prev);
            // 檢查不通過的輸出成為新的草稿；其他失敗沿用 helper 上的草稿（修正可再按）
            applyDraft(loaded.draft ?? null);
            bump();
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
      setFailure((prev) => generationFailureOf(loaded.generation) ?? prev);
      end(token);
    });
    return () => {
      opRef.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // 只在切換職缺（fetchIntro 改變）時讀取一次
  }, [fetchIntro]);

  /** fix：「請 AI 修正」目前的草稿（使用者按下才送，不自動重試）。 */
  async function generate(fix = false) {
    const token = begin('generating');
    if (token === null) return;
    const sentAt = versionRef.current;
    const payload = fix ? { jobSnapshotId, fix } : { jobSnapshotId };
    const response = await bridge.send({ op: 'intro.generate', payload });
    if (!current(token)) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
      end(token);
      return;
    }
    waitForResult(poll.maxPolls, sentAt, token);
  }

  // 儲存（helper 重跑檢查）。draft＝儲存草稿上的修改（P1-T071），通過才成為正式自介；沒通過就重讀，
  // helper 保留了這次的修改才套用（看得到新的問題），否則保留畫面上的修改。
  async function save(target: 'intro' | 'draft' = 'intro') {
    const token = begin('saving');
    if (token === null) return;
    const sentAt = versionRef.current;
    const toDraft = target === 'draft';
    const sent = toDraft ? draftBox.text : box.text;
    const payload = { jobSnapshotId, text: sent, ...(toDraft ? { draft: true } : {}) };
    const response = await bridge.send({ op: 'intro.update', payload });
    if (!current(token)) return;
    if (!response.ok) {
      const loaded = toDraft ? await fetchIntro() : undefined;
      if (!current(token)) return;
      if (loaded?.draft?.text === sent && versionRef.current === sentAt) {
        applyDraft(loaded.draft);
        bump();
      }
      setFailure(introFailureText(response));
    } else if (versionRef.current === sentAt) {
      applyIntro(response.intro, response.check);
      if (toDraft) applyDraft(null);
      bump(); // 儲存成功也是新版本：先前的確認（例如重新載入的警告）失效
      setNotice(
        toDraft
          ? '草稿通過檢查，已存成正式自介（只存在本機，不會送出）。請對照引用後再複製。'
          : '已儲存（只存在本機，不會送出），並重新檢查。',
      );
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
    const shown = box.text;
    try {
      const loaded = await fetchIntro();
      if (!current(token) || !loaded || versionRef.current !== sentAt) return;
      const fresh = loaded.intro;
      if (!fresh || !loaded.check) {
        setFailure('找不到已儲存的自介：請重新產生。');
        return;
      }
      if (box.dirty) {
        setFailure('有尚未儲存的修改：儲存後會重新檢查，通過才能複製。');
        return;
      }
      if (fresh.text !== shown) {
        // 已儲存的內容在別處變了（另一頁編輯、逾時後才產生完成）；沒有未存修改就同步成新內容（草稿不動）
        applyIntro(fresh, loaded.check);
        bump();
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

  /** 使用者輸入；請求進行中鎖住編輯。 */
  const edit = (set: (next: Box) => void) => (next: string) => {
    if (busyRef.current !== null) return;
    set({ text: next, dirty: true });
    bump();
  };

  return {
    intro,
    check,
    box,
    setText: edit(setBox),
    draft,
    draftBox,
    setDraftText: edit(setDraftBox),
    busy,
    version,
    failure,
    notice,
    generate: () => generate(),
    fix: () => generate(true),
    save: () => save(),
    saveDraft: () => save('draft'),
    copy,
    reload,
  };
}
