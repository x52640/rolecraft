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
 * 元素的排版方式：none＝整棵子樹不渲染；contents＝自己沒有框、子節點照常（不換行）；
 * inline＝不換行；block＝前後換行（比照 innerText）。
 */
export type DisplayKind = 'none' | 'contents' | 'inline' | 'block';

/**
 * 渲染判定（N6）：Chrome 用計算後樣式（`chrome-oracle.ts`），
 * 合成 DOM 測試（jsdom 沒有渲染）注入簡化判定（`simple-oracle.ts`）。
 * 只判定元素「自己」；祖先由抽取時逐層往下判定。
 */
export interface RenderOracle {
  display(el: Element): DisplayKind;
  /** 元素自己的文字節點與控制項值看不看得到（visibility:hidden／collapse 回 false）；子元素各自判斷 */
  textVisible(el: Element): boolean;
  /** 子節點都不渲染（content-visibility:hidden） */
  hidesChildren(el: Element): boolean;
  /** 元素裡文字節點的換行是否保留（white-space: pre、pre-wrap、pre-line、break-spaces） */
  preservesNewlines(el: Element): boolean;
  /**
   * 元素有 shadow root 時，shadow tree 裡全部的 slot（含封閉的 shadow root）；沒有 shadow root 回 null。
   * slot 是否被渲染、分配到哪些子節點由 `render.ts` 判定。
   */
  shadowSlots(el: Element): HTMLSlotElement[] | null;
}

export type ResumeBlock = ResumeCaptureBlock;
