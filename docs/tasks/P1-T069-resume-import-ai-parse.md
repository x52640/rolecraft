---
id: P1-T069
phase: 1
status: in_progress
depends_on: ["P1-T066", "P1-T064"]
specs: ["resume-import.md", "evidence-model.md", "providers.md", "bridge.md", "architecture.md"]
track: resume-import
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/", "packages/pipeline/src/index.ts", "packages/resume-import/src/", "packages/contracts/src/bridge/editor/import.ts", "packages/contracts/src/bridge/operations.ts", "packages/contracts/src/bridge/__fixtures__/editor-requests.ts", "packages/contracts/src/index.ts", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/import/", "apps/editor/src/bridge/", "docs/specs/resume-import.md", "docs/specs/bridge.md", "docs/adr/0006-contracts-interim-fields.md", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T069): 履歷 PDF 用 AI 整理成欄位，逐欄照抄原文檢查，聯絡資料只在本機抽取"
---

# 履歷 PDF 用 AI 整理欄位

## 目標

擁有者 2026-10-12 裁定：履歷解析全部用 AI（額度可接受），不再只靠版面規則。文字層仍在本機讀（不做 OCR）；把讀到的文字交給使用者選定的 Claude 模型整理成經歷、技能等欄位，程式逐欄檢查是否照抄原文，最後仍由使用者逐欄確認（R10）。

## 範圍

### 包含

- 聯絡資料不送模型（協調者保守選擇，記入 CURRENT_TASK）：送出前在本機抽出並移除「標籤：值／標籤⇥值」形式的聯絡類行（手機、電話、E-mail、地址、通訊地址、聯絡方式、LINE 等）與看起來像電話、email 的片段；這些欄位由本機規則直接預填個人資料。姓名也在本機抽（104 規則或頁首大字），不送模型
- pipeline `resume-parse/`：照 analysis／intro 的做法——資料區塊加隨機邊界、文字一律當資料不是指令；每行帶「頁-行」編號；要求模型輸出 JSON：學歷、經歷（公司、職稱、開始、結束、至今、描述）、技能、其他段落（求職條件、自傳等原樣保留標題）；每個欄位必須附來源行編號
- 輸出檢查（不捏造）：每個欄位值去除空白差異後必須是其來源行（可跨連續數行）的子字串；描述可為來源行的原文接合；不符的欄位丟棄並記原因；日期只能來自來源行；整份輸出格式不符 → 失敗不採用，不自動重試
- 執行走既有 Claude 生成路徑（選定模型、`ClaudeService.run`、R5／R6 每次重做、R6 紀錄照存）；未選模型或 Claude 不可用 → 不呼叫，回明確原因
- 橋接（相加）：例如 `import.ai_parse`（背景執行、立即回狀態）與查詢結果的方式（沿用 intro 的輪詢模式）；結果以既有 `structured` 草稿形狀回傳（或相加新欄位），出處保留頁碼行號
- 編輯器匯入頁：選好 PDF 後自動開始 AI 整理，顯示「AI 整理中」與進度；完成後預填表單；失敗或不可用時顯示原因，並用版面規則（P1-T066，104 有效）或通用規則的結果預填作為退路，標明來源；提供「重新用 AI 整理」按鈕（已編輯則先確認覆蓋）
- 測試全用假 provider：合格輸出被採用；捏造值（原文沒有的公司、改寫的職稱、編造日期）被丟棄；聯絡資料不出現在送給模型的提示裡；未選模型不呼叫；格式錯誤失敗；退路預填
- spec `resume-import.md` 寫入：AI 整理流程、照抄檢查、聯絡資料本機處理、退路

- 擁有者改裁定（2026-10-12，CURRENT_TASK #16）：認得出 104 版面（`structured` 存在）時用規則預填、不自動呼叫 AI；其他格式選好 PDF 後自動 AI 整理；兩者都保留「用 AI 重新整理」按鈕（104 時按下才呼叫）
- 對抗驗證與 codex review（2026-10-12）屬實項：
  - 個資：標籤中間有全形／半形空白（「姓　　名：」「地　　址：」）整行送出 → 比對前去掉所有空白並 NFKC
  - 個資：標籤與值分兩行（雙欄或冒號後換行）、「LINE ID xxx」無冒號 → 值在下一行也移除
  - 個資：英文標籤只認完全相等（Home／Mailing／Current Address、Contact Number、Personal Email）→ 改成包含關鍵字
  - 個資：頁首「中文名＋英文名」英文名沒遮 → 切掉的部分像英文姓名也加入遮蔽
  - 個資：全形數字電話、全形 ＠、+886 (0) 等 → 先 NFKC 再比對、位置對回原文
  - （codex P1）本機抽到「姓名⇥值」列時，該姓名沒加入遮蔽集合，內文「我是○○」照送 → 抽到的姓名一律加入遮蔽
  - （codex P1）104 聯絡值換行超過兩行，第三行照送 → 依完整已知值追蹤消耗，不設兩行上限
  - （codex P2）英文 Contact 區塊遇到「Employment History」「Technical Skills」等標題不停止，誤刪後續內容 → 重用 `headingKind` 的標題詞彙結束區塊
  - 捏造：「至今」可從任何含 now／present／目前 的行湊出 → 結束日期為至今類字眼時，要緊接在區間分隔符後或為獨立詞（英文詞界），且引用行要含數字日期
  - 捏造：描述可截取兩行頭尾拼句 → joined 類欄位以行為單位：每段必須等於某一引用行正規化後的全文（可去開頭 •、-、編號）
  - 捏造：短英數值無詞界（「Go」取自「Google」）→ 英數開頭／結尾要求詞界
  - 日期只要求含數字（「100人」可當開始日期）→ 要求年份或年月格式

- codex 審查待修（2026-10-12，修正 commit 2024faa 的 codex review，協調者寫入）：
  1. （P1，個資）`resume-parse/text.ts` 逐個碼位正規化，已知姓名含分解式重音（例如 `Jose\u0301 Sample`）時，`createRedactor` 把整段姓名正規化成組合字，比對不到，姓名原文送進模型。組合序列要一起正規化，同時保留原文位置。
  2. （P2）`resume-parse/labels.ts` 單獨一行的標籤判斷太寬：`Mobile Developer`、`GitHub Actions` 這類一般內容被當成個資標籤，`split` 把它和下一行（例如公司名、技能）一起刪掉。單獨一行要用嚴格的個資標籤辨識。
  3. （P2）`resume-parse/match.ts` 判斷「至今」時只認西元年（19xx／20xx），`民國110年7月～至今` 會變成 `current: false`。改用與日期驗證相同的年份格式。
  - 每項補測試。

- 對抗審查待修（2026-10-12，修正 cc63fdb 的對抗審查，協調者寫入）：
  1. （個資，退步）`labels.ts` 的 `isStrictPersonalLabel` 修飾字白名單太窄：`出生年月日`、`居住地址`、`微信號：`、`緊急聯絡人`、`個人網站`、`LinkedIn Profile`、`Residential／Permanent／Present Address`、`通訊處：`、`出生地`、`身分證字號`、`電子信箱`、`公司電話`、`身分證號`，以及雙欄 `姓名⇥出生年月日`／`王小明⇥1990/01/01`，修正前會抽出，修正後標籤與值送進模型。另外既有問題 `Line帳號：`／`abc123` 修正前後都送出。改法要同時滿足：上述標籤全部抽出（不送模型），且 `Mobile Developer`、`GitHub Actions`、`通訊軟體開發` 等一般內容照送。拿不準時偏向「當成個資、不送」。上述全部列入回歸測試。
  2. （捏造 current）`match.ts` 的 `HAS_DATE` 民國格式在行內任意位置會把一般小數當日期：`客戶滿意度 98.5% — 至今仍維持`、`使用 Python 3.10.12 ~ 至今`、`帶領 12.5 人 - 至今`、`負責 v10.2 模組 – 至今` 都讓 `currentWordGrounded` 回 true。要求「至今」前面緊接的區間起點是日期（西元或帶「民國」／「年」的民國年），純小數不算；`民國110年7月～至今` 仍要通過。
  3. （個資，低）`text.ts` 叢集正規化後，名單 `Amy`、內文 `Amý`（y＋組合記號）或名單 `Jose`、內文分解式 `José` 不再遮蔽（修正前會）。姓名比對再加一層去掉組合記號（NFKD 後刪 `\p{M}`）的比對，位置仍對回整個叢集；codex 審查 1 的情況（分解式名單與內文）仍要遮得到。


- OCR、圖片 PDF
- 刪除 P1-T066 的版面規則（保留作退路）

## 工作區與 Context

### 必讀入口

- `plan.md`（R1、R5、R6、R10 相關決策）
- `docs/specs/resume-import.md`、`evidence-model.md`、`providers.md`（R5、R6）、`bridge.md`（import、intro 段）
- P1-T064、P1-T066 完成結果；`packages/pipeline/src/intro/`、`packages/pipeline/src/prompts/`、`apps/helper/src/handlers/intro/`（照同樣模式）、`apps/helper/src/handlers/import/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1 不捏造、R5／R6 計費路線、個資），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts（相加）、分派表與 fixtures
- 不讀擁有者真實 PDF；測試資料合成且去識別化
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 見「範圍」測試項

### 手動驗證

- 協調者以開發入口（P1-T068）用擁有者 PDF 實跑一次（擁有者已同意自測用量）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首次實作（pipeline resume-parse、helper import.ai_parse／ai_status、編輯器自動整理與退路、規格）；頁首姓名去標語；main.ts 接上 AI 整理服務（協調者擴充 write_paths 後另一個 commit）；第二輪：104 改用規則（擁有者改裁定 #16）、個資遮蔽 8 項與捏造檢查 4 項修正
- 已通過驗證：worktree `npm run verify` 綠（見完成結果「第二輪」）；第二輪新增的 15 項回歸測試換回舊實作全部失敗；全程假 provider
- codex 審查待修 3 項已修（先寫測試重現，3 項都重現；見完成結果「codex 審查項修正」）
- 對抗審查待修 3 項＋codex review cc63fdb 追加 3 項已修（先寫測試重現，修正前 30 個案例失敗；見完成結果「對抗審查項修正」）
- codex 複審待修 3 項已修（修正 d069fcd；先寫測試重現，修正前 11 個案例失敗；防退步比對 276 個案例無退步；見完成結果「codex 複審項修正」）
- 下一步：codex review 本次修正 diff 後收官
- Blocker：無

## 完成結果

- 橋接相加 `import.ai_parse`（背景整理、立即回狀態、同一匯入不重送）與 `import.ai_status`（輪詢）；contracts 新增 `ImportAiDraft`、`ImportAiParseView`、`ImportAiFailure`、`ImportAiDiscard(Reason)`，ADR-0006 第 15 項；兩份請求 fixture、分派表同步。
- pipeline `resume-parse/`（prepare／personal／prompt／output／check／run 拆檔）：
  - 本機處理姓名與聯絡資料：個資標籤行（手機、電話、E-mail、地址、通訊、聯絡、LINE、網站、生日、性別、年齡、兵役、身分證等）整行移除並預填；104 已知值的換行續行一併移除；「聯絡方式」等標題下整段移除；其餘行的姓名、個資值、email／電話／身分證字號片段換成佔位字。測試直接檢查提示字串沒有任何個資。
  - 提示：整份文字放進隨機界線資料區塊，每行帶「[頁-行]」，要求每欄附來源行。
  - 照抄檢查：引用行必須是送出的行；非描述欄位只能引用連續行；值去空白、NFKC 後須是引用行依序接合的子字串且每行都用到；對遮蔽文字檢查後，佔位字換回原文再對原文檢查一次；日期須含數字或為「至今」類字眼。不符欄位丟棄並記原因；整份格式不符失敗、不重試。
  - 執行沿用 intro 模式：`execute`＋R6 紀錄照存，R6 不通過不送出。
- helper：`ai-runner.ts`（背景執行、記憶體狀態、換代號防舊結果寫回、匯入被清掉時一併清掉）、`ai-source.ts`（姓名來源：104 規則、「姓名：」、頁首大字）、`assemble.ts`（`createClaudeGenerationEngine`＋`runCheckRecords`）。未選模型、解析失敗、移除後沒有文字、超過預算回固定訊息、不呼叫模型。
- resume-import：`headerNameCandidate`（頁首大字姓名候選）與 `cleanHeaderName`；協調者實測補充：頁首大字段落是「中文姓名＋空白＋標語」時只取姓名（104 結構化草稿的姓名也套用），英文姓名不切。
- 編輯器匯入頁：解析成功即自動整理；整理中鎖住表單與確認列；成功以 AI 結果預填並標「預填來源：AI 整理」，列出「AI 給的值與原文不符，已略過」的欄位與原因、其他段落（不寫入 Profile）；失敗或不可用顯示原因並保留 104／通用規則預填與來源；「重新用 AI 整理」在改過欄位時要再按一次確認。`useAiParse` 每次整理有自己的 token，換檔與卸載時作廢舊回應、取消輪詢；確認失敗回到核對畫面不會重跑 AI。
- 測試（全用假 provider）：合格輸出採用；捏造公司、改寫職稱、編造日期、引用聯絡行、不連續行、非日期、空白各自丟棄；模型自己寫出姓名不收；聯絡資料不在提示；未選模型不呼叫；格式錯失敗；R6 不通過不送；同時要求兩次只送一次；編輯器鎖定、預填、退路、重新整理確認、換檔舊回應作廢。
- 保守選擇（待擁有者裁定）：生日、性別、年齡、兵役、婚姻、個人網站也當個資不送；文中網址（非標籤行）照送；其他段落不寫入 Profile；擷取不到中文姓名時英文姓名不切標語；佔位字換回原文後回填（描述裡會出現原本的 email／電話）。
- 正式 helper 接線：`main.ts` 有資料區且有 PDF 選取器時改用 `createResumeImportWithClaude`（開發入口 harness 走同一個 `main()`）；`main.test.ts` 驗未選模型時 `import.ai_parse` 回原因、不是「尚未支援」。
- 手動驗證（擁有者 PDF 實跑）需協調者以開發入口進行。

### 第二輪（擁有者改裁定＋對抗驗證／codex 屬實項）

- 擁有者改裁定 #16：有 `structured`（104）時用規則預填、不自動呼叫 AI，畫面標「預填來源：104 版面規則（沒有使用 AI）」，按「用 AI 重新整理」才呼叫（改過欄位要再按一次確認）；其他格式照舊自動整理。`useAiParse` 加 `auto` 參數。
- 個資遮蔽 8 項（`labels.ts`、`redact.ts`、`personal.ts` 重寫，`hardening.test.ts` 逐項直接檢查提示字串）：標籤比對先 NFKC 去空白；標籤獨占一行（含雙欄標籤列）時下一行值移除、「LINE ID xxx」無冒號也認；英文標籤拆字含關鍵字即算（name、line 只認固定寫法）；頁首「中文名 英文名」的英文名加入遮蔽（`headerNameAlias`，helper `ai-source.ts`；helper 測試檢查提示）；遮蔽在 NFKC 文字上比對、範圍對回原文（全形數字電話、全形 ＠、+886 (0)）；抽到的姓名列一律加入遮蔽；104 已知值依序消耗、不設兩行上限；聯絡區塊用通用規則的標題詞彙加英文變體結束。
- 捏造檢查 4 項（`match.ts`）：「至今」類結束日期要緊接區間分隔符或獨占一欄且引用行有年份；描述／內文以行為單位比對整行；英數開頭結尾要合詞界；日期要年份或年月格式。提示同步要求描述逐行照抄、日期只放年份或年月。
- verify：Vitest 3460 通過、13 略過。
- 回歸測試：pipeline 12 項（個資 7＋捏造 4，第 4 項英文名由 helper 測試驗）＋helper 1 項＋編輯器 2 項（104 不自動呼叫、按鈕確認）；換回舊實作 15 項全部失敗。
- 保守選擇（待裁定）：中文個資標籤限 8 字內（「負責與客戶聯絡：…」這類 8 字內內文仍會被當成個資行移除，寧可少送）；頁首英文名只認中文名後 1～3 個大寫開頭英文字（「王小明 Product Manager」也會被遮蔽，換回原文後不影響預填）；描述同一條的換行續行可接成一段，但不能只取某行的一部分。

### codex 審查項修正（2026-10-12）

- 3 項都先以測試重現（`resume-parse/review-fixes.test.ts`，修正前 4 個案例失敗）再修：
  1. 個資：`text.ts` `nfkcMapped` 改以字素叢集（`Intl.Segmenter`）為單位做 NFKC，分解式重音（`Jose\u0301`）會合成後再比對；叢集內每個正規化字元都對應整個原文叢集，遮蔽範圍不會切在叢集中間，佔位字換回與原文一字不差。姓名清單與內文的組合／分解式任意搭配都遮蔽。
  2. `labels.ts` 新增 `isStrictPersonalLabel`：整個標籤只能由關鍵字與修飾字（號碼、帳號、行動；number、id、home、address 類）組成且至少一個關鍵字。`labelOnlyLine` 與 `personal.ts`「標籤：（值在下一行）」都改用嚴格辨識，`Mobile Developer`、`GitHub Actions`、`通訊軟體開發`（含結尾冒號）與下一行照送；`Mobile Phone`、`E-mail Address`、`聯絡電話`、`LINE ID` 仍連下一行移除。
  3. `match.ts` `currentWordGrounded` 的年份判斷改用與 `isDateValue` 同一組 `DATE_FORMATS`（`HAS_DATE`），`民國110年7月～至今` 得 `current: true`。
- verify：Vitest 3527 通過、13 略過。
- 殘餘（未在本次範圍）：同一行「標籤⇥值」「標籤：值」仍用寬鬆辨識（例：「GitHub Actions：CI 自動化」整行當個資移除，寧可少送、不外洩）。

### 對抗審查項修正（2026-10-12，修正 cc63fdb；含 codex review cc63fdb 追加 3 項）

- 先以測試重現（`resume-parse/adversarial-fixes.test.ts`，修正前 30 個案例失敗）再修：
  1. 個資標籤（`labels.ts` `isStrictPersonalLabel` 改寫，不列特例清單）：精確別名（去空白、連字號、小寫後等於 `LineID`、`FullName`、`中文姓名` 等既有別名）直接算；中文部分去掉空白（含全形空白）、英數、標點後限 8 字，且以「個資關鍵字」或「關鍵字＋結尾字（號、號碼、字號、帳號、年月日、日期、地、處、人…）」結尾，前面可接任意修飾；英文每個字（不在詞彙時試駝峰拆字）都要屬個資詞彙（關鍵字或修飾字，新增 residential、permanent、present、profile、emergency 等）且至少一個關鍵字；中英混合（`Line帳號`）英文全屬詞彙、中文只有結尾字也算。寬鬆辨識另加「嚴格認得的也算」與關鍵字「本名」。對抗審查列的標籤、雙欄 `姓名⇥出生年月日`、`Line帳號：`／`abc123`、codex 追加的 `地　　址：`、`LineID`、`FullName`、`中文姓名：` 都連下一行移除；`Mobile Developer`、`GitHub Actions`、`通訊軟體開發`、`Product Line`、`Company Name`、`網站改版專案負責` 與下一行照送。
  2. 「至今」（`match.ts` `currentWordGrounded`）：改在保留空白的 NFKC 文字上找「日期起點＋區間分隔符＋至今」，或「至今」獨占一欄／一行且前一欄／行以日期起點結尾。日期起點：西元年（可帶月日）、月／西元年、英文月份＋年、民國年（必須帶「民國」或「年」），前面不能緊接數字、小數點、英文字；純小數不算。`98.5% — 至今`、`Python 3.10.12 ~ 至今`、`12.5 人 - 至今`、`v10.2 模組 – 至今` 丟棄；`民國110年7月～至今`、`2021/07~至今`、`01 2019–Present`、`2019.07⇥至今` 通過。移除 `HAS_DATE`。
  3. 組合記號姓名（`text.ts` `foldMarks`、`nfkcMapped(…, fold)`；`redact.ts`）：姓名在原樣比對之後，再對「去掉組合記號」的文字比一次（NFKD 刪 `\p{M}` 再 NFKC，以字素叢集為單位），位置對回整個原文叢集；名單 `Amy`／內文 `Amý`、名單 `Jose`／內文分解式或組合式 `José` 都遮蔽，codex 審查 1 的情況仍通過。
- verify：Vitest 3576 通過、13 略過。
- 殘餘：中文規則偏向當成個資，8 字內以個資關鍵字結尾的單獨一行（如「產品官方網站」「負責對外聯絡人」）會連下一行一起不送；「12 年 - 至今」這類兩三位數＋年會被當成民國年起點。

### codex 複審項修正（2026-10-12，修正 d069fcd）

- 先以測試重現（`resume-parse/recheck-fixes.test.ts`，修正前 11 個案例失敗）再修：
  1. 括號修飾標籤（`labels.ts` `withoutParens`）：NFKC 後去掉成對括號段，原樣或去括號後任一個認得就算（嚴格、寬鬆辨識都套用，不會比原本少認）。「地址（戶籍）」「住址(住家)」「電話（公司）」（含結尾冒號）、「Address (Household Registration)」連下一行移除；「通訊軟體開發（即時訊息）」「Mobile Developer (iOS)」「GitHub Actions（CI）」照送。
  2. 重疊遮蔽合併（`redact.ts` `mergeSpans`）：所有比對範圍先收齊，重疊的合併成一段再替換（不論誰先比對到）；每段都是姓名才用姓名佔位字。`Jose.Sample@example.org` 整段遮掉，`unredact` 一字不差。
  3. 日期分隔空白（`match.ts` `START_DATE`）：年月日之間的分隔符前後可有空白（`2021 / 07 - 至今`），區間起點仍要西元年或帶「民國」「年」；`98.5% — 至今`、`Python 3.10.12 ~ 至今`、`v10.2 – 至今`、`v10 . 2 – 至今` 仍丟棄。
- 防退步比對（暫存腳本，不進 repo）：cc63fdb 之前、d069fcd、本版三版，276 個案例（既有回歸測試的標籤／日期／姓名輸入，加補充的常見中英文個資標籤、括號變體與一般內容行、版本號與小數日期）；本版比舊版少抽出／少遮蔽或日期判斷變差的案例：0。
- verify：Vitest 3607 通過、13 略過。
- 殘餘：括號內容不檢查（「通訊（5G）」單獨一行仍當標籤，與「通訊」單獨一行一致，偏向不送）。
