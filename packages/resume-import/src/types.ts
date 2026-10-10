/** 文字層裡的一段文字（pdfjs TextItem 的精簡版）。座標單位為 PDF point，原點在頁面左下。 */
export interface TextRun {
  text: string;
  x: number;
  /** 基線 y */
  y: number;
  width: number;
  /** 字高（約等於字級） */
  height: number;
  /** 文字有旋轉或傾斜 */
  rotated: boolean;
}

/** 一頁的原始文字層。 */
export interface RawPage {
  /** 頁碼，從 1 開始 */
  pageNumber: number;
  width: number;
  height: number;
  runs: TextRun[];
}

/** 重組後的一行文字，保留頁碼與位置（F02：保留頁碼與來源）。 */
export interface TextLine {
  pageNumber: number;
  /** 欄位序號：單欄或跨欄行為 0，雙欄的左欄 0、右欄 1 */
  column: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 一頁依閱讀順序排好的行。 */
export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  /** 偵測到的欄數（1 或 2） */
  columns: 1 | 2;
  lines: TextLine[];
}

/** 擷取失敗原因：一律明確回傳，不當成成功。 */
export type ExtractFailureReason =
  | 'invalid_pdf' // 不是 PDF 或檔案損壞
  | 'encrypted' // 有密碼保護
  | 'no_text_layer' // 沒有文字層（掃描檔；D18 首版請手動輸入）
  | 'garbled_text' // 亂碼比例過高（缺字、字型對應錯誤）
  | 'reading_order_unreliable'; // 讀取順序異常（文字重疊、大量旋轉）

export interface ExtractFailure {
  ok: false;
  reason: ExtractFailureReason;
  /** 給使用者看的說明 */
  message: string;
}

/** 欄位草稿的確認狀態：擷取出來的一律「未確認」，只有使用者校正後才會改變。 */
export type DraftFieldStatus = 'unconfirmed';

/** 欄位來源位置：第幾頁、該頁閱讀順序的第幾行（從 0 開始）。 */
export interface DraftSource {
  pageNumber: number;
  lineIndex: number;
}

export interface DraftField {
  value: string;
  status: DraftFieldStatus;
  source: DraftSource;
}

/** 待校正欄位草稿。找不到的欄位留空（name 為 null、陣列為空），不捏造。 */
export interface ResumeFieldDraft {
  name: DraftField | null;
  dates: DraftField[];
  companies: DraftField[];
  titles: DraftField[];
  experiences: DraftField[];
  skills: DraftField[];
}

export interface ExtractSuccess {
  ok: true;
  pageCount: number;
  pages: ExtractedPage[];
  /** 沒有任何文字的頁碼（部分頁可能是圖片，需提示使用者手動補） */
  pagesWithoutText: number[];
  draft: ResumeFieldDraft;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;
