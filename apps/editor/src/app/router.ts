import { useEffect, useSyncExternalStore } from 'react';

/**
 * 極簡 hash 路由：擴充功能頁是靜態檔（chrome-extension://<id>/editor/index.html），
 * 不能用 history 路徑，所以用 #/<path>。只做目前骨架需要的「一層路徑對一頁」。
 */

/** 從 location.hash 取出路徑（不含開頭的 #/ 與結尾斜線），例如 "#/jobs/" → "jobs"。 */
export function pathFromHash(hash: string): string {
  return hash.replace(/^#\/?/, '').replace(/\/+$/, '');
}

export function hrefFor(path: string): string {
  return `#/${path}`;
}

/**
 * 離開前確認（P1-T091）：頁面有不能丟的狀態（例如未存修改）時註冊一則提示；
 * 換頁（導覽列、頁內連結、上一頁）前先問使用者，不確認就把 hash 換回原頁、畫面不動。
 * 沒有註冊的頁面行為不變。
 */
const guards = new Set<{ message: string }>();
/** 目前畫面所在的 hash；換頁被擋時換回這裡。 */
let shownHash: string | null = null;

const currentHash = () => window.location.hash;

/** hash 變了：有註冊的提示就先確認；不確認回 false 並換回原頁（不新增歷史紀錄）。 */
function allowHashChange(): boolean {
  const next = currentHash();
  const prev = shownHash;
  if (prev === null || pathFromHash(prev) === pathFromHash(next)) {
    shownHash = next;
    return true;
  }
  const [guard] = guards;
  if (guard && !window.confirm(guard.message)) {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}${prev}`);
    return false;
  }
  shownHash = next;
  return true;
}

function subscribe(onChange: () => void): () => void {
  shownHash = currentHash();
  const handler = () => {
    if (allowHashChange()) onChange();
  };
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}

/** 目前的路由路徑；hash 變動時重新渲染。 */
export function useHashPath(): string {
  return useSyncExternalStore(subscribe, () => pathFromHash(window.location.hash));
}

/**
 * 頁面註冊離開前確認：message 不為 null 時，站內換頁要使用者確認，關閉或重新整理分頁也請瀏覽器確認。
 * message 為 null（例如沒有未存修改）時不攔。
 */
export function useLeaveGuard(message: string | null) {
  useEffect(() => {
    if (message === null) return undefined;
    const guard = { message };
    guards.add(guard);
    shownHash ??= currentHash();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      guards.delete(guard);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [message]);
}
