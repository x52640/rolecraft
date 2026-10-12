/** 投遞自介（D25；R1、R8、D6、D7、D14）的共用型別。全部是可序列化的純資料。 */
import type {
  Claim,
  ClaimCitation,
  IntroProblem,
  JobSnapshot,
  Profile,
} from '@rolecraft/contracts';

import type { CitationDraft } from '../generation/types.ts';

/** 產生當下的輸入（呼叫端從 storage 讀出；事實項應已過來源關卡）。 */
export interface IntroInputs {
  readonly jobSnapshot: JobSnapshot | null;
  /** 唯一且已確認的個人資料；沒有或未確認時為 null（不送進提示） */
  readonly profile: Profile | null;
  /** 全部事實項；只有可用於生成的才會送出（R1、R2） */
  readonly claims: readonly Claim[];
}

/** 模型輸出（已通過格式驗證，尚未對照事實項）。 */
export interface IntroOutput {
  readonly intro: string;
  /** 本機編號 C1、C2…＋寫成的完成程度（只有功能、交付物要標） */
  readonly citations: readonly CitationDraft[];
}

/** 沒通過檢查的模型輸出（P1-T071）：不寫入，只交給呼叫端保留成草稿。 */
export interface IntroDraftContent {
  readonly text: string;
  readonly citations: readonly ClaimCitation[];
  readonly problem: IntroProblem;
  /** 問題片段（例如沒有出處的數字）；沒有可標的片段為空 */
  readonly fragments: readonly string[];
}

/** 「請 AI 修正」的回饋（P1-T071）：上一版草稿與它的問題；草稿與片段都是資料，放進資料區塊。 */
export interface IntroFeedback {
  readonly previous: string;
  readonly problem: IntroProblem;
  readonly fragments: readonly string[];
}
