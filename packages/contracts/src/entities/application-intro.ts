import { z } from 'zod';

import { Id, Timestamp } from './common.ts';
import { ClaimCitation } from './resume-version.ts';

/**
 * 投遞自介（D25、jobs-and-messages.md「投遞自介」；P1-T064）：針對一個職缺快照的 300 字內簡短自介，
 * 只能編輯與複製，不自動送出（D7）。每個職缺快照只保存最近一份。
 */

/** 字數上限：以 Unicode 字元（code point）計，含標點與空白。超過整份不採用（不截斷）。 */
export const INTRO_MAX_CHARS = 300;

/** 自介字數（code point 數）；編輯器與 helper 用同一個算法。 */
export function introLength(text: string): number {
  return [...text].length;
}

/**
 * 自介檢查不通過的原因（生成與使用者編輯後共用同一套檢查）：
 * 字數、引用（存在、可用、不重複、完成程度不高於事實項，D14）、數字／網址／倍數詞要有依據（R1 檢查 3）、
 * 不承諾面試時間、薪資、到職日、不寫聯絡方式，最後再過 R1 匯出前檢查。
 */
export const IntroProblem = z.enum([
  'empty', // 空白
  'too_long', // 超過 300 字
  'no_citation', // 沒有引用任何事實項
  'unknown_claim', // 引用的事實項不存在或目前不可用（待複核、來源已移除等）
  'duplicate_citation', // 重複引用
  'completion_not_stated', // 引用功能／交付物沒標完成程度
  'completion_not_applicable', // 其他類型標了完成程度
  'completion_exceeds_claim', // 宣稱的完成程度高於事實項狀態（D14）
  'number_not_grounded', // 數字不在引用的事實項、個人資料或使用者確認文字中
  'link_not_grounded', // 網址或網域不在引用的事實項中
  'multiplier_not_grounded', // 倍數／比例詞不在引用的事實項中
  'commits_time', // 提到時間或日期（不得承諾面試時間）
  'commits_salary', // 提到薪資待遇
  'commits_start_date', // 提到到職、開始、加入等
  'contact_info', // email 樣式或通訊軟體帳號
  'export_check_failed', // R1 匯出前檢查不通過（最後一道）
]);
export type IntroProblem = z.infer<typeof IntroProblem>;

/** 一個職缺快照最近一份投遞自介。 */
export const ApplicationIntro = z.strictObject({
  jobSnapshotId: Id,
  /** 目前文字（使用者編輯後的版本；可能超過上限或未通過檢查，此時不能複製） */
  text: z.string(),
  /** 生成時通過檢查的引用；使用者編輯不改引用 */
  citations: z.array(ClaimCitation),
  /** 產生時間（helper 決定） */
  generatedAt: Timestamp,
  /** 產生後是否經使用者編輯 */
  userEdited: z.boolean(),
});
export type ApplicationIntro = z.infer<typeof ApplicationIntro>;
