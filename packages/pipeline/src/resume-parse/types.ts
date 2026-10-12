/** 履歷 AI 整理（P1-T069；R1、R5、R6、R8、R10、D6）的共用型別。全部是可序列化的純資料。 */
import type { ImportDraftField } from '@rolecraft/contracts';

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

/** 送給模型的一行：id＝「頁-行」（行號從 1 起算）；text 已遮蔽姓名與聯絡資料，original 是原文。 */
export interface SentLine {
  readonly id: string;
  /** 在送出行清單中的順序（判斷連續） */
  readonly order: number;
  readonly pageNumber: number;
  readonly lineIndex: number;
  readonly text: string;
  readonly original: string;
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
