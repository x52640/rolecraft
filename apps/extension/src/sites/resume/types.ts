import type { Platform, ResumeCaptureBlock } from '@rolecraft/contracts';

/**
 * 各站履歷頁的設定（各站實際值在 P1-T077 登記；web-resume-capture「頁型登記」）。
 * 只讀根節點內；姓名元素可以在根節點外，只給 helper 本機遮蔽與預填（W6）。
 */
export interface ResumeSiteConfig {
  platform: Exclude<Platform, 'linkedin'>;
  /** 履歷本文根節點的選擇器；找不到＝擷取失敗、不送（N3） */
  rootSelector: string;
  /** 選填的姓名元素選擇器 */
  nameSelector?: string | null;
}

/**
 * 「是否可見」「是否換行」的判定（N6）：Chrome 用實際渲染（`chrome-oracle.ts`），
 * 合成 DOM 測試（jsdom 沒有渲染）注入簡化判定（`simple-oracle.ts`）。
 */
export interface RenderOracle {
  /** 元素本身有沒有被渲染（display:none、visibility:hidden 等回 false）；子樹另外判定 */
  isRendered(el: Element): boolean;
  /** 元素前後會不會換行（區塊層級回 true，行內回 false） */
  breaksLine(el: Element): boolean;
}

export type ResumeBlock = ResumeCaptureBlock;
