# ADR-0005 中文 PDF 匯出方式

- 日期：2026-10-10
- 狀態：建議（待協調者收官、擁有者確認）
- 相關：plan.md D9、D10、D15；`docs/specs/resume-output.md` F07；`docs/specs/open-verifications.md` S10；Task P1-T026
- 實測腳本：`scripts/spikes/pdf/run.mjs`（可重跑，見文末）

## 結論

**用 HTML＋CSS 模板，交給使用者電腦上已安裝的 Chromium 系瀏覽器列印成 PDF（puppeteer-core 驅動、獨立暫存 profile、headless）；字型隨安裝包附 Noto Sans TC 靜態 TrueType 400／700（SIL OFL 1.1），每次匯出前先用 HarfBuzz（subset-font，WebAssembly）依履歷實際文字裁字型，再交給 Chromium。**

匯出後必跑三道自動檢查（P1-T027 實作）：

1. pdfjs 擷取全文，逐段比對原文，**碼位必須完全相同**（擋下康熙部首替換，見下）。
2. 匯出前用字型 cmap 檢查每個字都有字形；缺字就擋下並指出是哪個字，不讓瀏覽器偷偷改用系統字型。
3. PDF 內字型清單只能出現隨附字型（出現 PingFang、AppleColorEmoji 等就算失敗）。

## 實測結果（2026-10-10，macOS Darwin 27.0、Node v26.8.2、Chrome 155.0.8059.39）

樣本：虛構中文履歷 37 段、A4 兩頁，含全形標點、中英混排、網址、人名罕用字（堃喆犇）。

| 代號 | 做法 | 檔案大小 | 段落擷取 | 碼位錯誤 | 畫面（人眼看 PNG） | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | pdf-lib＋fontkit 子集化，Noto CFF OTF | 136 KB | 37/37 | 0 | **亂碼／大量空白**（Quartz、pdfjs 兩種渲染器都錯） | 不可用 |
| A2 | pdf-lib 整檔內嵌 CFF OTF | 9.9 MB | 35/37 | 10 | 數字間距錯、整頁變粗 | 不可用 |
| A3 | pdf-lib＋fontkit 子集化，可變字重 TTF | 66 KB | 37/37 | 0 | 正常，但只有預設字重、無粗體 | 不可用（沒有粗體） |
| A4 | pdf-lib＋fontkit 子集化，靜態 TTF 400＋700 | 82 KB | 37/37 | 0 | **第二個字型（粗體）大量缺字** | 不可用 |
| A7 | 同 A4 但只用一個字型、罕用字探針 | 5 KB | 1/1 | 0 | **只畫出 3 個字**，其餘空白 | 不可用 |
| A5 | 先 HarfBuzz 裁字型，再 pdf-lib 整檔內嵌 | 139 KB | 35/37 | 10 | 粗體數字間距錯 | 不可用 |
| B1 | Chromium，可變字重 TTF | 810 KB | 11/37 | 27 | 正常 | 不可用（Type3 字型、碼位錯） |
| B2 | Chromium，CFF OTF | 402 KB | 11/37 | 27 | 正常 | 不可用（Type3 字型、碼位錯） |
| B3 | Chromium，靜態 TTF 400＋700 | 98 KB | 11/37 | 27 | 正常 | 不可用（碼位錯） |
| **B4** | **Chromium，靜態 TTF 400＋700，先 HarfBuzz 依文字裁字型** | **94 KB** | **37/37** | **0** | **正常，粗體正確，標點不落行首** | **採用** |
| B9 | 同 B3，探針含字型沒有的 𠮷、😀 | 21 KB | 1/1 | 0 | 正常（但用了系統字型補字） | 見「缺字」 |

時間（實測，本機）：B4 整體 423 ms，其中啟動 Chrome 260 ms、列印 52 ms；HarfBuzz 裁兩個 7 MB 字型共約 19 ms（A5 量到）。pdf-lib 路線 50–140 ms。

### 關鍵發現（都是實測）

1. **文字擷取正確不等於畫面正確。** pdf-lib＋@pdf-lib/fontkit 的子集化，在 Noto Sans TC 上 ToUnicode 對、擷取全對，但字形畫錯或空白（A1、A4、A7）；換字型格式、換字數都會發生，不是單一字型檔的問題。所以 spike 另外用 pdfjs 把第 1 頁畫成 PNG 給人看。
2. **Chromium 會把「小」寫成康熙部首「⼩」。** Noto 的 cmap 把 U+5C0F 和 U+2F29 指向同一個字形，Chrome 反查時選了部首碼位。畫面看起來一樣，但複製貼上、ATS 搜尋「小」「一」「人」「大」會找不到（B1–B3 各 27 個字錯，另有 – 變 ‒、• 變 ·、／ 變 ∕）。**先用 HarfBuzz 依實際文字裁字型後，cmap 裡沒有部首碼位，問題消失（B4：0 錯）。**
3. **Chromium 遇到 CFF（OTF）或可變字重字型會輸出 Type3**（每個字畫成向量路徑，不是真字型），靜態 TrueType 才是正常內嵌的 CIDFontType2。所以字型要用靜態 TTF。
4. **缺字時 Chromium 會自動改用 macOS 系統字型**（B9 的 PDF 內出現 PingFangTC、AppleColorEmoji），畫面不會有豆腐字，但等於把系統字型的字形放進 PDF、換台電腦結果不同。pdf-lib 則畫出豆腐框或空白。兩者都要靠「匯出前 cmap 檢查」擋。
5. **Arc 無法用 puppeteer-core 啟動 headless**（等待 WS endpoint 30 秒逾時；當時使用者的 Arc 正在執行，原因未確認）。Chrome 可以。

## 理由

- 只有 B4 同時通過：可選取、碼位正確、無缺字、粗體正確、檔案小。
- 版面交給瀏覽器排：中文斷行（標點避頭）、`break-inside`、`orphans/widows`、`@page` 邊界都是 CSS 現成的；pdf-lib 路線要自己寫換行與分頁（spike 只做到簡化版避頭，還留「210ms／。」這類問題）。
- 預覽與匯出用同一份 HTML/CSS，編輯器預覽即所見即所得。
- 不需要原生模組編譯：puppeteer-core 與 subset-font（HarfBuzz WebAssembly）都是純 JS／WASM（D10）。

## 代價

- **依賴使用者已安裝的 Chromium 系瀏覽器**（D9 保證使用者有 Chrome／Arc／Edge 其一）。實測只有 Chrome 可用；Edge 本機未安裝未測，Arc 啟動失敗。若使用者只有 Arc，要另找路（例如擴充功能用 `chrome.debugger` 呼叫 `Page.printToPDF`，或另附 chrome-headless-shell，後者會讓安裝包大很多）——**都未實測**。
- **安裝包多 14.2 MB 字型**（Static400 7,090,820 bytes＋Static700 7,085,600 bytes）＋OFL.txt。可在建置時預先裁成常用字集縮小（推論，未測）；但罕用人名字會因此缺字，要先決定字集。
- 每次匯出啟動一次 headless 瀏覽器（約 0.25 秒）；匯出不頻繁，可接受。
- 分頁控制只能用 CSS 宣告，不能逐行精算；「最多 2 頁」（D15）要匯出後讀頁數再提示調整。
- Google Fonts 靜態 TTF 網址帶版本號（v40），改版會失效；正式版應把字型檔與 sha256 固定進安裝包建置流程。

## 授權

- Noto Sans TC：SIL Open Font License 1.1，可隨軟體散布、可嵌入文件；Reserved Font Name 是「Source」，我們不改名、不散布修改版字型檔（每份 PDF 內的子集屬文件嵌入）。安裝包要附 OFL.txt。
- macOS 系統字型（PingFang 等）不得打包；也不應讓它們被嵌進 PDF（檢查 3）。

## 未實測（推論或待後續）

- Edge、Arc 的實際列印行為；Windows。
- 超過 2 頁、表格、圖片、超連結可點擊（F07 要求檢查連結）——spike 樣本沒有可點擊連結。
- 標點擠壓與避尾的實際效果只用肉眼看了第 1 頁。
- 擴充功能 `chrome.debugger` 路線、chrome-headless-shell 打包大小。
- 建置時預裁常用字集後的大小。

## 重跑方式

```bash
npm install
node scripts/spikes/pdf/run.mjs                 # 預設輸出到系統暫存區 rolecraft-pdf-spike/
node scripts/spikes/pdf/run.mjs --out <資料夾> --fonts <字型快取> --browser <Chromium 執行檔>
```

第一次會從 notofonts／google/fonts（GitHub）與 fonts.gstatic.com 下載約 38 MB 字型（免費、免登入）。產出：各代號 PDF、第 1 頁 PNG、`report.json`（含字型 sha256、時間、擷取比對結果）。
