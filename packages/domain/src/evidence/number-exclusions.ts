/**
 * 數字擷取的排除表（R1 檢查 3）。
 *
 * 預設：中文數字字元與英文數字詞一律當成數字（fail closed）。只有整個數字片段
 * 落在下表某個詞「裡面」時才不算；片段比詞長就照算（「第三方」不算，「第三百名」照算）。
 * 表要保持窄：只收常見、明確不是數量主張的詞。加詞前先問「段落寫這個詞會不會在宣稱數量」，
 * 會的話就不要加（例如「排名第一」「零停機」都是主張，不收）。
 */

interface Exclusion {
  readonly word: string;
  readonly reason: string;
}

const EXCLUSIONS: readonly Exclusion[] = [
  // 零：零售業、零件產業
  { word: '零售', reason: '產業名（retail）' },
  { word: '零件', reason: '名詞（parts）' },
  { word: '零組件', reason: '名詞（components）' },
  { word: '零散', reason: '形容詞（scattered）' },
  { word: '零碎', reason: '形容詞（fragmented）' },
  { word: '零星', reason: '形容詞（sporadic）' },
  // 第一／第三：固定詞，不是排名
  { word: '第三方', reason: '名詞（third-party）' },
  { word: '第一線', reason: '名詞（front line）' },
  { word: '第一手', reason: '形容詞（first-hand）' },
  { word: '第一時間', reason: '副詞（immediately）' },
  { word: '第一步', reason: '名詞（first step）' },
  { word: '第一個', reason: '序數＋量詞（the first one），不是排名' },
  { word: '第一版', reason: '名詞（first version）' },
  { word: '第一階段', reason: '名詞（first phase）' },
  // 萬／千萬：副詞
  { word: '萬一', reason: '連詞（in case）' },
  { word: '千萬不', reason: '副詞「千萬」（by all means），後接否定' },
  { word: '千萬別', reason: '副詞「千萬」，後接否定' },
  { word: '千萬要', reason: '副詞「千萬」' },
  { word: '萬無一失', reason: '成語（foolproof）' },
  // 一：副詞、形容詞、不定冠詞
  { word: '一些', reason: '不定量（some）' },
  { word: '一起', reason: '副詞（together）' },
  { word: '一直', reason: '副詞（always）' },
  { word: '一般', reason: '形容詞（general）' },
  { word: '唯一', reason: '形容詞（only／unique）' },
  { word: '統一', reason: '動詞（unify）' },
  { word: '统一', reason: '動詞（unify，簡體）' },
  { word: '一致', reason: '形容詞（consistent）' },
  { word: '一定', reason: '副詞（certainly）' },
  { word: '一樣', reason: '形容詞（same）' },
  { word: '一样', reason: '形容詞（same，簡體）' },
  { word: '一旦', reason: '連詞（once）' },
  { word: '一切', reason: '代詞（everything）' },
  { word: '一律', reason: '副詞（uniformly）' },
  { word: '一同', reason: '副詞（together）' },
  { word: '一向', reason: '副詞（consistently）' },
  { word: '一併', reason: '副詞（along with）' },
  { word: '一并', reason: '副詞（along with，簡體）' },
  { word: '一系列', reason: '形容詞（a series of）' },
  { word: '一站式', reason: '形容詞（one-stop）' },
  { word: '一鍵', reason: '形容詞（one-click，產品用語）' },
  { word: '一键', reason: '形容詞（one-click，簡體）' },
  { word: '一體', reason: '名詞／副詞（integrated）' },
  { word: '一体', reason: '名詞／副詞（integrated，簡體）' },
  { word: '一手', reason: '副詞（single-handedly／first-hand）' },
  { word: '一方面', reason: '連詞（on one hand）' },
  { word: '一部分', reason: '名詞（a part of）' },
  { word: '一成不變', reason: '成語（unchanging）；避免「成」被換算成百分比' },
  { word: '進一步', reason: '副詞（further）' },
  { word: '进一步', reason: '副詞（further，簡體）' },
  { word: '同一', reason: '形容詞（same）' },
  { word: '單一', reason: '形容詞（single）' },
  { word: '单一', reason: '形容詞（single，簡體）' },
  { word: '逐一', reason: '副詞（one by one）' },
  { word: '之一', reason: '「…之一」（one of）' },
  { word: '一個', reason: '不定冠詞（a／an）' },
  { word: '一个', reason: '不定冠詞（a／an，簡體）' },
  { word: '一套', reason: '不定冠詞（a set of）' },
  { word: '一款', reason: '不定冠詞（a [product]）' },
  { word: '一種', reason: '不定冠詞（a kind of）' },
  { word: '一种', reason: '不定冠詞（a kind of，簡體）' },
  { word: '一項', reason: '不定冠詞（an item）' },
  { word: '一项', reason: '不定冠詞（an item，簡體）' },
  // 十／百：程度副詞、專有名詞
  { word: '十分', reason: '副詞（very）' },
  { word: '十足', reason: '形容詞（full）' },
  { word: '百度', reason: '公司名（Baidu）' },
  { word: '百科', reason: '名詞（encyclopedia）' },
  { word: '四處', reason: '副詞（everywhere）' },
  { word: '四处', reason: '副詞（everywhere，簡體）' },
  // 英文（不分大小寫）
  { word: 'three.js', reason: '函式庫名' },
  { word: 'one of', reason: '「…之一」，不是數量' },
  { word: 'one-on-one', reason: '形容詞（1:1 會談）' },
  { word: 'no one', reason: '代詞（nobody）' },
  { word: 'one-stop', reason: '形容詞（one-stop）' },
  { word: 'one-click', reason: '形容詞（one-click）' },
];

/** 給測試與文件用：排除表內容。 */
export const NUMBER_EXCLUSIONS: readonly Exclusion[] = EXCLUSIONS;

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** 文字中所有排除詞出現的位置（英文不分大小寫）。 */
export function exclusionSpans(text: string): Span[] {
  // 只轉 ASCII 大小寫，避免 toLowerCase 改變字串長度、位置對不上
  const lower = text.replace(/[A-Z]/gu, (c) => c.toLowerCase());
  const spans: Span[] = [];
  for (const { word } of EXCLUSIONS) {
    const needle = word.toLowerCase();
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
      spans.push({ start: at, end: at + needle.length });
    }
  }
  return spans;
}

/** 片段是否整個落在某個排除詞裡面。 */
export function isExcluded(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((s) => s.start <= start && end <= s.end);
}
