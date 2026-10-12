import type { ImportWebBlock } from '@rolecraft/contracts';
import { createContext, useContext } from 'react';

/**
 * 網頁來源的核對（D29）：表單欄位旁顯示出處原文、點一下連到原文區對應區塊。
 * 只有網頁來源有值；PDF、手動輸入是 null（欄位旁不顯示任何出處）。
 */
export interface WebSource {
  readonly blocks: ReadonlyMap<string, ImportWebBlock>;
  /** 展開原文區並捲到該區塊（顯示區塊編號） */
  readonly jump: (blockId: string) => void;
}

export const WebSourceContext = createContext<WebSource | null>(null);

export const useWebSource = (): WebSource | null => useContext(WebSourceContext);
