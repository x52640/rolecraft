---
id: P1-T078
phase: 1
status: in_progress
depends_on: ["P1-T074"]
specs: ["resume-import.md", "evidence-model.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/", "packages/pipeline/src/index.ts", "packages/resume-import/src/draft/header-name.ts", "packages/resume-import/src/draft/header-name.test.ts"]
contract_change: none
expected_commit: "feat(P1-T078): pipeline：網頁區塊來源的去個資、提示與照抄檢查"
---

# pipeline：網頁區塊來源的去個資、提示與照抄檢查

## 目標

沿用 P1-T069 的 AI 整理，把來源單位從「頁-行」擴成網頁區塊：送模型前在本機去個資、提示帶區塊種類與標籤、照抄檢查以區塊為單位。PDF 路徑行為不變（除了共用的 512 KiB 草稿上限）。

## 範圍

### 包含

- 準備（resume-import「網頁來源的 AI 整理」去個資）：區塊依序當行；標籤＋值區塊以「標籤：值」判斷，個資標籤整塊移除、值預填；`continues` 的同標籤續行一併移除並接回同一列（預填與遮蔽用完整值）；聯絡區移除到下一個同級或更高級標題；已知姓名四個來源由呼叫端傳入（姓名元素文字先套 `cleanHeaderName`）、別名規則；既有 Profile 的聯絡值加入遮蔽；送出條件不成立（本次頁面姓名沒辨識出、也沒有使用者確認的姓名）→ 回明確拒絕原因、不產生提示
- 提示：區塊帶「[b12 h3]」「[b13 標籤=職務類別]」格式，整份在隨機界線資料區塊內；模型輸出來源編號依來源種類驗證（PDF `頁-行`、網頁 `b<數字>`），格式不對整份不合格
- 照抄檢查：值出自引用區塊；描述分段規則；標籤不算來源文字；「至今」獨占區塊時往前找日期上下文（略過只有分隔符的區塊、去結尾分隔符後整個是 `isDateValue`、中間無標題），上下文不列入引用
- 欄位值還原出姓名或個資時標旗標（W7）
- 通過檢查的草稿序列化後 UTF-8 超過 512 KiB 整份判失敗（PDF 與網頁共用）

- 審查待修（2026-10-12，對抗審查＋codex review 修正 commit e34f16b，協調者寫入；fix commit 另提）：
  1. （個資，104 樣本可重現）`web-names.ts` `ENGLISH_NAME` 要求名字後接空白或結尾：「Ivy Lin，高雄人」「Ivy Lin, from…」只遮到 Ivy、Lin 送出 → 結尾改成「後面不是英文字」；resume-import `headerNameAlias` 同一規則同步。
  2. （R1，PDF 也有）`check.ts` `citedLines` 以送出清單順序判連續，移除的個資區塊不佔位：`門市`／`手機：…`／`經理` 引用 b2、b4 拼出原文沒有的「門市經理」→ 描述與段落內文以外的欄位，網頁用區塊編號、PDF 用原始行位置（空白行不算）判連續。
  3. （個資）多種寫法漏遮：標籤 英文名／中文名／暱稱／現居地／戶籍／居住城市（＋下一塊地址）／Born／年次；標籤沒認出的標籤＋值區塊值裡含「LINE:」「LINE ID」；標籤＋值區塊的中文標籤超過 8 字（緊急聯絡人姓名與電話）；姓名值「林雨晴／Ivy Lin」依 ／ / ( 拆開各自遮；4 格以上表格列每對標籤／值個別判斷；「聯絡方式 Contact」中英並列標題也開聯絡區；姓名比對允許中文字間空白（「林 雨 晴」）。
  4. （個資，codex）聯絡標題含換行時，續行標題區塊（continues）被當成下一個同級標題、結束聯絡區：`<h2>聯絡方式<br>虛構市某路一號</h2>` 地址送出 → 續行不當段落邊界。
  5. （個資，codex）既有 Profile 的多行聯絡值以含換行的單一字串遮蔽，比不到單行區塊 → 加入各行與合併變體。
  6. （codex）`isNameLabel` 不認 First Name／Last Name 等 `isPersonalLabel` 已支援的姓名標籤，誤判 name_unconfirmed → 兩者一致。
  - 每項先寫測試重現；另用 104 fixture（`apps/extension/src/sites/104/fixtures/resume-edit.html` 結構）跑一次 `prepareWebResumeParse`，列出提示中仍可疑的人名／聯絡樣式。
- 複審待修（2026-10-12，codex 複審修正 commit 8ca7904，協調者寫入；fix commit 另提）：
  1. （個資）`labels.ts` 新認得的「姓：林」「名：晴」滿足姓名確認條件，但遮蔽只遮 2 字以上姓名，「我是林晴」原樣送出 → 姓＋名合併成完整姓名（含中間空白變體）加入遮蔽；合併不出 ≥2 字姓名時不算已確認姓名（name_unconfirmed）；單字值不加入遮蔽，但標籤區塊一律不送。
  2. （個資）`web-labels.ts` 標籤＋值區塊標籤沒認出、值是「姓名：林雨晴」時，把整串當值，遮蔽比不到後文「我是林雨晴」→ 預填與遮蔽改用內層的值。
  - 補通則測試：任何讓姓名確認條件成立的路徑，其姓名在後文段落都必須被遮蔽。

### 不包含

- helper 接線、記憶體狀態、姓名從哪來（P1-T080）
- 編輯器
- 改 PDF 既有規則（P1-T069 的回歸測試全部照舊通過）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「AI 整理欄位」「網頁來源的 AI 整理」
- `docs/specs/evidence-model.md` R1
- P1-T069 完成結果（含各輪屬實項）；`packages/pipeline/src/resume-parse/`（`prepare.ts`、`personal.ts`、`redact.ts`、`labels.ts`、`match.ts`、`check.ts`、`output.ts`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資不送模型、R1 不捏造）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 提示字串不含姓名、電話、email、地址；含「姓名只在無標籤標題」案例；「林測試 Alex Lin」英文別名被遮蔽；分成多行（`continues`）的地址預填與遮蔽都是完整值；送出條件不成立時不產生提示
- 照抄：以區塊為來源的捏造被丟棄；切開的多行描述、「2019/03」「~」「至今」三個區塊被接受；「2020 年得獎作品」後接「至今」、中間隔標題的「至今」被丟棄；網頁來源編號用 `頁-行` 格式整份不合格
- 模型重複照抄同一大區塊、草稿超過 512 KiB 時整份失敗（PDF 也套用）
- P1-T069 既有回歸測試全部通過

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 複審 2 項修正（第三個 commit `fix(P1-T078): 複審 2 項…`，未 push）；之前：審查 6 項修正
- 已通過驗證：`npm run verify` 綠（Vitest 3862 通過、13 略過）；P1-T069 既有 resume-parse 測試全過、resume-import header-name 測試全過；104 fixture 粗略區塊模擬 0 項可疑
- 下一步：協調者複審後收官（標 done）；helper 接線在 P1-T080
- Blocker：無
- write_paths 擴充理由（協調者 2026-10-12 指示）：審查 1 的英文別名結尾規則與 resume-import `headerNameAlias` 同一條，兩邊要同步，故加入 `packages/resume-import/src/draft/header-name.ts` 與其測試

## 完成結果

- 新增（`packages/pipeline/src/resume-parse/`）：
  - `web-personal.ts` `splitWebBlocks`：區塊依序當行套 PDF 標籤規則；標籤＋值區塊直接看標籤；被移除區塊後的 `continues` 一併移除並接回同一列；標題聯絡區移除到同級或更高級標題（段落形式照 PDF 8 行規則）；同標籤第二個值不預填但一律遮蔽；遮蔽用每段＋接回後完整值。
  - `web-names.ts` `knownNames`：四個姓名來源合併；中文姓名開頭後接 1–3 個大寫英文字的別名（headerNameAlias 同規則，另允許中英之間無空白）；「中文名 其他字」切出中文名。
  - `web-prepare.ts` `prepareWebResumeParse`：送出條件（姓名元素或姓名標籤值，否則要使用者確認姓名；只有舊 Profile 姓名不算）→ `name_unconfirmed`；標籤也遮蔽；既有 Profile 聯絡值加入遮蔽；姓名元素文字預填「姓名」，出處取第一個含它的區塊，找不到不預填。
  - `web-prompt.ts`：「[b12 h3]」「[b13 標籤=職務類別]」「li2」「tr」「p」標記，隨機界線資料區塊。
  - `web-check.ts` `checkWebResumeParse`、`currentFromContext`：出處＝區塊編號；標籤不算來源；獨占區塊的「至今」往前找日期上下文（略過純分隔符、去結尾分隔符後整個 `isDateValue`、無標題區塊、區塊編號須連續）；還原佔位字時標 `containsPersonalData`。
- 共用改動：`check.ts` 抽出 `checkFields`＋`FieldAdapter`（PDF 行為不變，`checkResumeParse` 簽名不變）；`output.ts` `parseResumeParseOutput(raw, source='pdf')` 依來源驗編號；`run.ts` 加 `runWebResumeParse`、`draftFitsLimit`，PDF 與網頁草稿 UTF-8 超過 512 KiB 判 `invalid_output`；`redact.ts` 加 `restoresSecret`（相加）；`personal.ts` 匯出 `CONTACT_HEADINGS`、`CONTACT_BLOCK_MAX`；`types.ts` 加 `SourceLine`、`WebSentLine`、`WebResumeParseInputs`。
- 測試：`web-prepare.test.ts`（9）、`web-check.test.ts`（7）。
- 保守選擇：送出條件 (2) 認任何形式抽到的姓名標籤值（含段落／表格「姓名：值」）；「至今」上下文中間有本機移除的區塊即不算；W7 旗標只做網頁來源（PDF 欄位不加，維持既有輸出）。
- 審查 6 項修正（`web-review-fixes.test.ts`，12 項；先寫測試，修正前 9 項重現失敗；另加 104 結構案例）：
  1. `web-names.ts` 與 resume-import `headerNameAlias`：英文名結尾改「後面不是英文字」，去掉結尾 . ' -；三字別名另加前兩字。PDF：頁首別名後接標點時遮到完整英文名（多遮）。
  2. `SourceLine.position`：非描述欄位改用原文位置判連續。PDF＝非空白行流水號（移除的個資行佔位，空白行與換頁不佔位）；網頁＝區塊編號；`currentFromContext` 同改用 position。PDF：拼接跨過移除的個資行時改判 `lines_not_consecutive`（原本會通過），其餘不變。
  3. `labels.ts`：中文關鍵字加 英文名、中文名、暱稱、綽號、現居、戶籍、居住城市、年次；英文加 born、nickname、surname、givenname、familyname、middlename；姓名精確標籤加 firstname、lastname、姓、名、姓氏、名字。網頁專用 `web-labels.ts`：`isPersonalBlockLabel`（標籤＋值區塊的中文標籤不限 8 字）、標籤沒認出時看值是否為「LINE: …」等個資標籤行、4 格以上偶數格表格列逐對判斷（任一對是個資就整列移除）、中英並列聯絡標題 `isContactHeading`。`web-names.ts` 姓名值依 ／ / ( ) 拆開。`redact.ts` 姓名比對允許相鄰中文字間空白。PDF：上述關鍵字的標籤行改為移除（多遮）、姓名字間空白也遮。
  4. `web-personal.ts` `regionEnds`：續行（continues）不當段落邊界。
  5. `web-prepare.ts` `lineVariants`：既有 Profile 聯絡值依換行拆成各行＋接合（無分隔、空白）變體。
  6. `isNameLabel` 認 NAME_EXACT 與 英文名／中文名／暱稱／綽號／本名，與 `isPersonalLabel` 一致（First Name 等算姓名標籤）。
  - 104 fixture 模擬時另發現並修正：段落形式的「個人資料」聯絡區內，獨占一塊的標籤（主要手機⏎值）改成連下一塊一起移除、不佔 8 塊上限（原本地址值會溢出送出）；只有「英文姓名」列時仍用姓名元素預填中文姓名。
  - 104 fixture 結果（以 jsdom 粗略切區塊、姓名元素「林雨晴」；含與不含 display:none 區塊兩種）：提示中姓名、英文名、電話、email、地址、性別年齡兵役 0 項。這是模擬抽取，正式區塊抽取在 P1-T075／T077。
- 複審 2 項修正（`web-name-paths.test.ts`，26 項；修正前 6 項重現失敗）：
  1. `web-labels.ts` `namePart`、`web-personal.ts` `namesOf`：「姓／姓氏／Last Name／Family Name／Surname」與「名／名字／First Name／Given Name／Middle Name」的值合併成完整姓名（姓名、姓 名、名 姓、名姓）加入遮蔽；完整姓名標籤的值、合併姓名都至少 2 字才算辨識。`web-prepare.ts`：姓名元素與使用者確認的姓名也要至少 2 字才算。單字值不加入遮蔽，但標籤區塊照樣移除。
  2. `web-labels.ts` `labelOf`：標籤沒認出時改用內層「標籤：值」的值預填與遮蔽（內層值空白才用整塊）。
  - 通則測試：姓名、Name、Full Name、英文姓名、中文名、英文名、暱稱、姓＋名（兩種順序）、姓氏＋名字、First／Given／Surname 組合、段落、表格列、4 格表格列、標籤獨占一塊、內層標籤、聯絡區內、姓名元素，各自的姓名在後文段落都被遮蔽。104 fixture 模擬重跑仍 0 項可疑。PDF 路徑不受影響。

