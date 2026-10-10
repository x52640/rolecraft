/**
 * 隨附字型清單（ADR-0005）：Noto Sans TC 靜態 TrueType 400／700。
 * 授權：SIL Open Font License 1.1（可隨軟體散布、可嵌入文件；不改名、不散布修改版字型檔）。
 * 字型檔不進 repo（各約 7 MB）：用 `npm run fonts:fetch -w @rolecraft/pdf-export -- --out <資料夾>`
 * 下載並比對 sha256；雜湊不符一律拒用。來源網址含 Google Fonts 版本號（v40），
 * 失效時重查 https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700 並更新網址與雜湊。
 *
 * 本檔只放常數（scripts/fetch-fonts.mjs 也直接 import），不得 import 其他模組。
 */

export interface BundledFontFile {
  readonly fileName: string;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
}

export const NOTO_SANS_TC_REGULAR: BundledFontFile = {
  fileName: 'NotoSansTC-Regular-400.ttf',
  url: 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
  sha256: '619662a0583f38311e92666927e5edbfd30f2a1fbe8593685660bd11bdd46a10',
  bytes: 7_090_820,
};

export const NOTO_SANS_TC_BOLD: BundledFontFile = {
  fileName: 'NotoSansTC-Bold-700.ttf',
  url: 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf',
  sha256: '33e8464f3432fd9eba5fa6ff74f5fb9ee612cad703877bd71c36e6f167c0a7e3',
  bytes: 7_085_600,
};

/** 授權全文；安裝包要和字型放在一起。 */
export const NOTO_SANS_TC_LICENSE: BundledFontFile = {
  fileName: 'OFL.txt',
  url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/OFL.txt',
  sha256: '1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9',
  bytes: 4_388,
};

export const BUNDLED_FONT_FILES: readonly BundledFontFile[] = [
  NOTO_SANS_TC_REGULAR,
  NOTO_SANS_TC_BOLD,
  NOTO_SANS_TC_LICENSE,
];
