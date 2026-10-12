/** 履歷 AI 整理（P1-T069；R1、R5、R6、R8、R10、D6）的共用型別。全部是可序列化的純資料。 */
import type { ImportDraftField, ImportWebBlock, ResumeBlockKind } from '@rolecraft/contracts';

/** 解析後的一頁：依閱讀順序的行（與 ImportResult.pages 相同）。 */
export interface ResumeParsePage {
  readonly pageNumber: number;
  readonly lines: readonly string[];
}

/** 本機規則已知的個人資料（例如 104 版面的「標籤 ⇥ 值」，值可能接了換行續行）。 */
export interface PersonalHint {
  readonly label: string;
  readonly value: string;
}

export interface ResumeParseInputs {
  readonly pages: readonly ResumeParsePage[];
  /** 本機抽到的姓名（104 規則、頁首大字或「姓名：」），第一個當預填；全部都不送模型 */
  readonly names: readonly ImportDraftField[];
  readonly personalHints: readonly PersonalHint[];
}

/** 送給模型的一個來源單位（PDF 的行、網頁的區塊）：text 已遮蔽姓名與聯絡資料，original 是原文。 */
export interface SourceLine {
  readonly id: string;
  /** 在送出清單中的順序（判斷連續） */
  readonly order: number;
  readonly text: string;
  readonly original: string;
}

/** 送給模型的一行：id＝「頁-行」（行號從 1 起算）。 */
export interface SentLine extends SourceLine {
  readonly pageNumber: number;
  readonly lineIndex: number;
}

/** 送給模型的一個網頁區塊（D28）：id＝helper 配發的區塊編號（b12）；標籤不算來源文字。 */
export interface WebSentLine extends SourceLine {
  readonly kind: ResumeBlockKind;
  readonly level: number | null;
  /** 標籤＋值區塊的標籤（已遮蔽，只給模型看；照抄檢查不用） */
  readonly label: string | null;
}

/** 網頁來源的 AI 整理輸入（D28；resume-import「網頁來源的 AI 整理」）。姓名四個來源都由呼叫端傳入。 */
export interface WebResumeParseInputs {
  /** helper 依順序配發編號的區塊 */
  readonly blocks: readonly ImportWebBlock[];
  /**
   * (1) 姓名元素文字：呼叫端先套 cleanHeaderName；headerNameAlias 切出的英文名也放這裡。
   * 沒登記或找不到給空陣列。
   */
  readonly pageNames: readonly string[];
  /** (3) 資料區既有 Profile 的姓名（只用於遮蔽，不算本次頁面的姓名已辨識） */
  readonly profileNames: readonly string[];
  /** (4) 使用者在匯入頁確認的姓名（可多個寫法） */
  readonly confirmedNames: readonly string[];
  /** 既有 Profile 的聯絡資料值（加入遮蔽） */
  readonly profileContacts: readonly string[];
}

/** 模型給的一個欄位：值＋來源行 id。 */
export interface RawField {
  readonly value: string;
  readonly lines: readonly string[];
}

export interface RawExperience {
  readonly company: RawField | null;
  readonly title: RawField | null;
  readonly start: RawField | null;
  readonly end: RawField | null;
  readonly description: RawField | null;
}

/** 模型輸出（已通過格式驗證，尚未對照原文）。 */
export interface ResumeParseOutput {
  readonly education: readonly RawField[];
  readonly experiences: readonly RawExperience[];
  readonly skills: readonly RawField[];
  readonly sections: readonly { readonly heading: RawField; readonly body: RawField }[];
}
