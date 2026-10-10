---
id: P1-T024
phase: 1
status: in_progress
depends_on: ["P1-T022", "P1-T019"]
specs: ["resume-output.md", "evidence-model.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/generation/", "packages/pipeline/src/index.ts", "packages/contracts/src/entities/resume-version.ts"]
contract_change: none
expected_commit: "feat(P1-T024): pipeline：職缺匹配與段落生成"
---
# pipeline：職缺匹配與段落生成

## 目標

F07：對照職缺產生有引用的履歷段落。

## 範圍

### 包含

- 匹配：職缺需求 ↔ 已確認事實項，產出能力、證據、待補資訊
- 段落生成：每段附引用事實項與宣稱完成程度；公司、職稱、日期由 Profile 帶入不交給模型
- 修改理由簡述

### 不包含

- UI、PDF

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T022
- 相依 Task 的「完成結果」：P1-T019

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 只用可用狀態的事實項（R1、R2）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- fake provider 測試；R1 檢查整合

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：對抗驗證修正（倍數詞、寬鬆網址、職缺公司名；`generation/grounding.ts`）
- 已通過驗證：`npm run verify` 綠（Vitest 2304 通過、11 略過；generation 88 個測試）
- 下一步：協調者收官；helper 的 `resume.generate` 接線（P1-T025）把 runner 的埠接到 storage／providers
- Blocker：無

## 完成結果

- 結構（`packages/pipeline/src/generation/`）：`prompt.ts`（指令、資料區塊）、`output.ts`（輸出格式驗證）、`completion.ts`（宣稱完成程度上限）、`sections.ts`（輸出→ResumeVersion、匹配、待補資訊）、`prepare.ts`（計畫與送出前檢查）、`runner.ts`（R9 執行）、`types.ts`。重用 P1-T022 的 `dataBlock`／`chooseBoundary`／`isUsableBoundary`、`extractUrls`、`Cancellation`／`UnitFailure` 型別，以及 domain 的 `extractNumbers`／`numberKeys`／`isUsableForGeneration`／`checkExportReadiness`／work-job 狀態機。
- contracts（additive，ADR-0006 第 9 項）：`ResumeSection` 加選填 `rationale`（修改理由簡述，≤300 字）與 `decision`（`SectionDecision`：pending／accepted／rejected，缺省視同 pending）；匯出 `SECTION_RATIONALE_MAX_CHARS`。沒動既有欄位，也沒加段落歸屬（留給 P1-T040）。
- 輸入把關（`prepareGeneration`，任一不成立就 `not_sent`、不呼叫模型）：職缺快照必須存在、ID 相同、已確認，且確認時間等於計畫時記下的（改過後重新確認→`snapshot_changed`）；Profile 必須 `pdfParseConfirmed`；事實項只取合法、ID 唯一且 `isUsableForGeneration` 的（待複核、來源矛盾、來源已移除未確認、沒有依據的都不送）；沒有可用事實項不送；提示超出預算不送（R8，不拆批）。
- D6 提示：職缺各欄、事實項內容、經歷職稱與描述各自放進資料區塊（隨機界線標記、撞到資料就換、換不到丟錯），指令前後明示是資料不是指令。事實項只用本機編號 C1…，類型、狀態、「最高可寫」程度由本機標在區塊外。經歷只送職稱與描述（E1…），不送公司與日期；指令要求段落不寫公司、職稱、日期。
- 輸出格式（整份不合格＝不寫入任何部分）：單一 JSON 物件（可一層 ```json），`matches`／`gaps`／`sections` 三欄；多餘欄位、缺欄位、空字串、超量、編號格式不對、placement 不是 summary／project／E 編號、statedCompletion 不在 completed／in_progress／planned 都整份失敗。
- 逐段檢查（`convertGeneration`，任一不合就丟整段並記原因，不修補、不降級）：placement 經歷編號要存在；至少一個引用；引用編號必須是這次提供的可用事實項；同段不可重複引用；功能／交付物必須標完成程度、其他類型不可標；完成程度不得高於上限（使用者確認完成且確認文字等於現有內容→已完成；確認後內容改過或文件標示完成→進行中；計畫中、未知→規劃中）；段落文字的網址必須完全等於所引用事實項（含確認文字）中的網址 token，數字必須在其中（無法解析的數字也丟）；最後每段再過 domain `checkExportReadiness`（不帶 Profile，數字只認引用的事實項）。沒有任何段落留下 → 整份失敗。
- 產出 `GenerationResult`：`resumeVersion`（段落 origin generated、`generatedCitations`＝引用副本、`sectionConfirmation` null、`decision` pending、附 rationale；整份過 contracts schema）、`placements`（經歷段落的公司、職稱、起訖日期、原文全從 Profile 帶入）、`matches`（需求→事實項 ID；沒有證據或引用不存在編號的整筆丟）、`gaps`（需求＋要問使用者的問題）、`droppedSections`、`droppedMatches`。
- 執行（`createGenerationRunner`，一個工作一個單元，`planGeneration` 建計畫）：每次送出都經呼叫端 `execute`（應包 `runWithSubscriptionCheck`），紀錄一律交 `recordRunCheck`；R6 不成立→`blocked` 不送出；other 錯誤不重試、不重送→`blocked`（狀態回到送出前）；額度→暫停；取消→暫停；格式不合格或沒有段落通過，比照暫時性錯誤有上限重試（2 次、2s→4s），用盡暫停 retries_exhausted；結果與工作狀態經 `commitUnit` 一次寫入；暫停後不自跑（D21）。
- 測試（fake provider 經 `runWithSubscriptionCheck`）：完整流程（注入文字只在資料區塊、不可用事實項不送出、產出版本過 domain R1 檢查）；不合格輸出／全部段落誇大完成程度／引用捏造編號三種都不寫入且有上限重試；重試後合格可完成；401 不重試；額度暫停；R6 不成立不送出；快照失去確認不送出；暫停不自跑。另有輸出格式 21 種不合格、逐段 13 種丟棄原因、送出前 8 種不送出情境、提示資料區塊與公司日期不外送。
- 保守選擇／待擁有者裁定：(1) 「文件標示完成」最高只能寫成「進行中」，「未知」最高「規劃中」（spec 只明訂不得寫成已完成；未知是否應完全禁止引用待裁定）；(2) 生成段落一律要有引用，無引用段落直接丟（spec 允許無引用段落靠逐段確認匯出，生成端不產生）；(3) 引用不存在／不可用的事實項只丟該段，沒有段落留下才整份失敗並重試；(4) 沒有可用事實項時不送出（也就不產生待補資訊）；(5) 不另送 company 與日期欄位；經歷 description 原文照送；(6) 段落位置（placement）放在 pipeline 的結果型別，沒有寫進 contracts（避免與 P1-T040 的段落歸屬欄位衝突），helper 存檔時需依 P1-T040 定的欄位對應。
- 殘餘：提示過大時只拒送，不拆批（全部可用事實項一次送出）；匹配與待補資訊沒有 contracts 型別、尚無持久化位置；helper `resume.generate` 尚未接上（P1-T025）；自我介紹與專案段落沒有原文可對照（Profile 沒有對應欄位）；domain 的 `extractNumbers` 也不認倍數詞（翻倍、twice 等），匯出端對使用者自寫文字同樣放行，需另開 domain Task。

### 對抗驗證修正

| 缺陷 | 修正 | 測試 |
| --- | --- | --- |
| （major）倍數／比例詞（翻倍、加倍、倍增、成倍、翻番、減半、折半、中文數字＋倍、double／triple／quadruple／halve 各變化、in half、twice、thrice、N-fold）不算數字，可憑空寫出成效 | 新增 `grounding.ts` `extractMultipliers`：段落出現、但引用事實項（含確認文字）沒有相同詞（小寫、空白與連字號統一）→ 丟該段（`multiplier_not_in_claims`） | `sections.test.ts`：翻倍、減半、doubled、twice、in half、threefold 都丟；事實項有相同詞則保留；`grounding.test.ts` |
| （major→minor）網址只抓 http／www，裸網域、全形、零寬字元可繞過 | 比對前一律 NFKC＋去零寬字元（U+200B–200D、U+2060、U+FEFF）；另抓裸網域＋路徑（`extractLooseUrls`，主機小寫，含 email 網域；頂層是常見副檔名的檔名、版本號、純數字不算），段落抽到的必須在引用事實項抽到的集合中，否則 `link_not_in_claims` | `sections.test.ts`：github.com/x、evil.com、me@evil.com、ｈｔｔｐｓ://、零寬字元拆開的網址與網域都丟；`grounding.test.ts`：README.md、Node.js、v1.2.3 不誤判 |
| （加固）段落可寫職缺公司或職稱 | 段落文字（NFKC、去零寬、小寫、去空白後）含職缺快照的 company 或 title → 丟該段（`mentions_job_identity`）；Profile 自身公司名不擋；提示同步要求不寫職缺公司與職稱 | `sections.test.ts`：職缺公司、含空白的職稱都丟；Profile 公司保留 |
