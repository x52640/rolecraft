import { useSyncExternalStore } from 'react';

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

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** 目前的路由路徑；hash 變動時重新渲染。 */
export function useHashPath(): string {
  return useSyncExternalStore(subscribe, () => pathFromHash(window.location.hash));
}
