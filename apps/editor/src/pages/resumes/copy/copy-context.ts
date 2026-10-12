import { useSyncExternalStore } from 'react';

/**
 * 段落複製需要的頁面狀態（P1-T086）：目前畫面顯示的履歷版本，以及畫面上有沒有匯出前檢查結果。
 * 由 useResumeEditor 發布、SectionCard 讀取（段落卡片的 props 由 ResumesPage 決定，這裡不經過它）。
 * 頁面只有一個履歷編輯器；編輯器卸載時清成 null，複製一律停用。
 */
export interface CopyContext {
  readonly versionId: string;
  /** 畫面上的版本有匯出前檢查結果；沒有就不能判定，不能複製 */
  readonly checked: boolean;
}

let current: CopyContext | null = null;
const listeners = new Set<() => void>();

export function publishCopyContext(next: CopyContext | null): void {
  if (current?.versionId === next?.versionId && current?.checked === next?.checked) return;
  current = next;
  for (const listener of listeners) listener();
}

export function readCopyContext(): CopyContext | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCopyContext(): CopyContext | null {
  return useSyncExternalStore(subscribe, readCopyContext, readCopyContext);
}
